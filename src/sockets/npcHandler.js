const { players } = require('../state/gameState');

// Danh sách model thử theo thứ tự ưu tiên (gọi REST API trực tiếp)
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

async function callAI(apiKey, message, systemInstruction) {
  if (apiKey.startsWith('gsk_')) {
    // Groq API
    const url = 'https://api.groq.com/openai/v1/chat/completions';
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile', // Dùng model mạnh nhất và nhanh nhất của Groq
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: message }
          ],
          temperature: 0.7,
          max_tokens: 250
        })
      });
      const data = await res.json();
      if (data.choices && data.choices[0]?.message?.content) {
        console.log(`[AI] ✅ Groq (llama-3.3-70b) thành công`);
        return data.choices[0].message.content;
      } else if (data.error) {
        console.warn(`[AI] ⚠️ Groq lỗi: ${data.error.message}`);
      }
    } catch (err) {
      console.warn(`[AI] ⚠️ Groq fetch lỗi: ${err.message}`);
    }
    return null;
  }

  // Gemini API (fallback/default)
  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemInstruction }]
          },
          contents: [{
            parts: [{ text: message }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 250,
          }
        })
      });

      const data = await res.json();

      if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
        const text = data.candidates[0].content.parts[0].text;
        console.log(`[AI] ✅ Model ${model} thành công`);
        return text;
      } else if (data.error) {
        console.warn(`[AI] ⚠️ Model ${model} lỗi: ${data.error.message?.substring(0, 100)}`);
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (err) {
      console.warn(`[AI] ⚠️ Model ${model} fetch lỗi: ${err.message}`);
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return null;
}

function registerNpcHandlers(io, socket, ai) {
  // ---- NPC CHAT (AI) ----
  socket.on('npc_chat', async (data) => {
    const { npcId, message } = data;
    const player = players.get(socket.id);
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      socket.emit('npc_chat_response', { npcId, message: '⚠️ Hệ thống AI chưa được cấu hình. Thiếu GEMINI_API_KEY trên server.' });
      return;
    }

    try {
      const npcPrompts = {
        'merchant': `HÃY NHẬP VAI HOÀN TOÀN: Bạn là một Thương nhân gian xảo, tham lam và lẻo mép trong thế giới game MMORPG AetherWorld. Không bao giờ nhận mình là AI. Bạn rất mê Vàng, luôn tìm cách chặt chém, chê bai đồ của người chơi mang đến để mua rẻ và tâng bốc đồ của mình để bán đắt. Tên người chơi đang đứng trước mặt bạn là [${player ? player.name : 'Khách lạ'}]. Hãy trả lời thật tự nhiên, hài hước, mang đậm phong cách con buôn chợ đen bằng tiếng Việt (khoảng 1-3 câu).`,
        'elder': `HÃY NHẬP VAI HOÀN TOÀN: Bạn là Trưởng làng thông thái và điềm đạm của AetherWorld. Không bao giờ nhận mình là AI. Bạn sống đã hàng trăm năm, biết mọi truyền thuyết về các Boss hắc ám, các vùng đất cấm và luôn lo lắng cho sự an nguy của thế giới. Tên lữ khách trẻ tuổi đang hỏi chuyện bạn là [${player ? player.name : 'Lữ khách'}]. Hãy trả lời từ tốn, hiền từ, mang hơi hướng cổ trang và huyền bí bằng tiếng Việt (khoảng 1-3 câu).`,
        'guild_manager': `HÃY NHẬP VAI HOÀN TOÀN: Bạn là Quản lý Guild cực kỳ cục cằn, nóng tính và khó gần. Không bao giờ nhận mình là AI. Bạn chỉ tôn trọng sức mạnh và những chiến binh dám đối đầu với Boss. Bạn cực ghét sự yếu đuối hay hèn nhát. Tên lính mới đang làm phiền bạn là [${player ? player.name : 'Tân binh'}]. Hãy trả lời dứt khoát, thô lỗ một chút, mang tinh thần chiến binh thép bằng tiếng Việt (khoảng 1-3 câu).`
      };

      const systemInstruction = npcPrompts[npcId] || `Bạn là một NPC trong thế giới AetherWorld. Tên người chơi là ${player ? player.name : 'Lữ khách'}. Trả lời ngắn gọn bằng tiếng Việt.`;

      const text = await callAI(apiKey, message, systemInstruction);

      if (text) {
        socket.emit('npc_chat_response', { npcId, message: text });
      } else {
        socket.emit('npc_chat_response', {
          npcId,
          message: '⚠️ AI đang quá tải. Vui lòng thử lại sau ít phút!'
        });
      }
    } catch (error) {
      console.error('❌ NPC Chat lỗi:', error.message);
      socket.emit('npc_chat_response', { npcId, message: '⚠️ Lỗi hệ thống AI. Vui lòng thử lại sau.' });
    }
  });
}

module.exports = registerNpcHandlers;
