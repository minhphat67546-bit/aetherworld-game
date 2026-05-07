const { players } = require('../state/gameState');

// Danh sách model thử theo thứ tự ưu tiên
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

async function callGeminiWithFallback(ai, contents, systemInstruction) {
  for (const model of GEMINI_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          temperature: 0.8,
          maxOutputTokens: 200,
        }
      });
      if (response && response.text) {
        console.log(`[AI] ✅ Đã dùng model: ${model}`);
        return response.text;
      }
    } catch (err) {
      let errMsg = err.message;
      try { errMsg = JSON.parse(err.message)?.error?.message || err.message; } catch {}
      console.warn(`[AI] ⚠️ Model ${model} thất bại: ${errMsg.substring(0, 120)}`);
      // Đợi chút trước khi thử model tiếp theo
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return null; // Tất cả model đều thất bại
}

function registerNpcHandlers(io, socket, ai) {
  // ---- NPC CHAT (AI) ----
  socket.on('npc_chat', async (data) => {
    const { npcId, message } = data;
    const player = players.get(socket.id);

    if (!ai) {
      socket.emit('npc_chat_response', { npcId, message: '⚠️ Hệ thống AI chưa được cấu hình. Thiếu GEMINI_API_KEY trên server.' });
      return;
    }

    try {
      const npcPrompts = {
        'merchant': `Bạn là một Thương nhân gian xảo và tham lam trong thế giới AetherWorld. Bạn luôn cố gắng bán đồ giá đắt và mua giá bèo. Tên người chơi đang nói chuyện với bạn là ${player ? player.name : 'Khách lạ'}. Trả lời ngắn gọn, hài hước, mang đậm phong cách con buôn bằng tiếng Việt.`,
        'elder': `Bạn là Trưởng làng thông thái của AetherWorld. Bạn biết rất nhiều truyền thuyết về các Boss, vùng đất, và luôn đưa ra những lời khuyên hữu ích cho người chơi. Tên người chơi đang nói chuyện với bạn là ${player ? player.name : 'Lữ khách'}. Trả lời ngắn gọn, từ tốn, hiền từ bằng tiếng Việt.`,
        'guild_manager': `Bạn là Quản lý Guild cục cằn. Bạn tôn trọng sức mạnh và những chiến binh dũng cảm đánh Boss. Tên người chơi là ${player ? player.name : 'Tân binh'}. Trả lời dứt khoát, mang tinh thần chiến binh, đôi khi mỉa mai kẻ yếu bằng tiếng Việt.`
      };

      const systemInstruction = npcPrompts[npcId] || `Bạn là một NPC trong thế giới AetherWorld. Tên người chơi là ${player ? player.name : 'Lữ khách'}. Trả lời ngắn gọn bằng tiếng Việt.`;
      const contents = [{ role: 'user', parts: [{ text: message }] }];

      const text = await callGeminiWithFallback(ai, contents, systemInstruction);

      if (text) {
        socket.emit('npc_chat_response', { npcId, message: text });
      } else {
        socket.emit('npc_chat_response', {
          npcId,
          message: '⚠️ [Server] AI đang quá tải hoặc đã hết quota. Vui lòng thử lại sau ít phút hoặc liên hệ admin để cập nhật API Key.'
        });
      }
    } catch (error) {
      console.error('❌ NPC Chat error không xử lý được:', error);
      socket.emit('npc_chat_response', { npcId, message: '⚠️ Lỗi hệ thống AI. Vui lòng thử lại sau.' });
    }
  });
}

module.exports = registerNpcHandlers;

