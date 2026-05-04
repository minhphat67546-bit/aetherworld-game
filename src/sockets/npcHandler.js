const { players } = require('../state/gameState');

function registerNpcHandlers(io, socket, ai) {
  // ---- NPC CHAT (AI) ----
  socket.on('npc_chat', async (data) => {
    const { npcId, message } = data;
    const player = players.get(socket.id);
    if (!ai) {
      socket.emit('npc_chat_response', { npcId, message: 'Hệ thống AI chưa được cấu hình (Thiếu GEMINI_API_KEY trong .env).' });
      return;
    }
    
    try {
      const npcPrompts = {
        'merchant': `Bạn là một Thương nhân gian xảo và tham lam trong thế giới AetherWorld. Bạn luôn cố gắng bán đồ giá đắt và mua giá bèo. Tên người chơi đang nói chuyện với bạn là ${player ? player.name : 'Khách lạ'}. Trả lời ngắn gọn, hài hước, mang đậm phong cách con buôn bằng tiếng Việt.`,
        'elder': `Bạn là Trưởng làng thông thái của AetherWorld. Bạn biết rất nhiều truyền thuyết về các Boss, vùng đất, và luôn đưa ra những lời khuyên hữu ích cho người chơi. Tên người chơi đang nói chuyện với bạn là ${player ? player.name : 'Lữ khách'}. Trả lời ngắn gọn, từ tốn, hiền từ bằng tiếng Việt.`,
        'guild_manager': `Bạn là Quản lý Guild cục cằn. Bạn tôn trọng sức mạnh và những chiến binh dũng cảm đánh Boss. Tên người chơi là ${player ? player.name : 'Tân binh'}. Trả lời dứt khoát, mang tinh thần chiến binh, đôi khi mỉa mai kẻ yếu bằng tiếng Việt.`
      };

      const systemInstruction = npcPrompts[npcId] || `Bạn là một NPC trong thế giới AetherWorld. Tên người chơi là ${player ? player.name : 'Lữ khách'}. Trả lời ngắn gọn bằng tiếng Việt.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: message,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.8,
        }
      });
      
      socket.emit('npc_chat_response', { npcId, message: response.text });
    } catch (error) {
      console.error('NPC Chat error:', error);
      socket.emit('npc_chat_response', { npcId, message: '*Nấc cụt* Xin lỗi, ta đang mệt, hãy quay lại sau...' });
    }
  });


}

module.exports = registerNpcHandlers;
