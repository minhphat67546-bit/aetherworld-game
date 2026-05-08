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
      // ── Build player context for AI ──
      const playerName = player ? player.name : 'Khách lạ';
      const playerGold = player ? (player.gold || 0).toLocaleString() : '0';
      const playerLevel = player ? player.level : 1;
      const playerClass = player ? player.class : 'Unknown';
      const playerRace = player ? player.race : 'Unknown';
      const playerBossKills = player ? (player.bossKills || 0) : 0;

      // Inventory summary: group by name with count
      let inventoryText = 'Túi đồ trống.';
      if (player && player.inventory && player.inventory.length > 0) {
        const grouped = {};
        player.inventory.forEach(item => {
          if (grouped[item.name]) grouped[item.name].count++;
          else grouped[item.name] = { ...item, count: 1 };
        });
        inventoryText = Object.values(grouped)
          .map(it => `${it.name} (${it.rarity || 'common'}) x${it.count}`)
          .join(', ');
      }

      // Equipment summary
      let equipText = 'Chưa trang bị gì.';
      if (player && player.equipment) {
        const eqParts = [];
        if (player.equipment.weapon) eqParts.push(`Vũ khí: ${player.equipment.weapon.name}`);
        if (player.equipment.armor) eqParts.push(`Giáp: ${player.equipment.armor.name}`);
        if (player.equipment.helmet) eqParts.push(`Mũ: ${player.equipment.helmet.name}`);
        if (player.equipment.accessory) eqParts.push(`Phụ kiện: ${player.equipment.accessory.name}`);
        if (eqParts.length > 0) equipText = eqParts.join(', ');
      }

      const playerContext = `
--- THÔNG TIN NHÂN VẬT ĐANG NÓI CHUYỆN VỚI BẠN ---
Tên: ${playerName}
Level: ${playerLevel}
Class: ${playerClass}
Chủng tộc: ${playerRace}
Vàng hiện có: ${playerGold} vàng
Boss đã giết: ${playerBossKills}
Trang bị đang mặc: ${equipText}
Túi đồ: ${inventoryText}
--- HẾT THÔNG TIN ---
QUY TẮC QUAN TRỌNG: Khi người chơi hỏi về mua/bán, BẠN PHẢI dựa vào số vàng và túi đồ thật ở trên để trả lời. Ví dụ: nếu họ có 955,994 vàng và muốn mua đồ 100,000 vàng, bạn biết họ ĐỦ TIỀN. Nếu họ muốn bán đồ, hãy kiểm tra xem trong túi đồ họ CÓ THỰC SỰ CÓ món đồ đó không. Nếu không có thì nói rằng bạn không thấy đồ đó trong túi của họ. Khi đưa giá, hãy dùng con số CỤ THỂ (ví dụ: 55,000 vàng, 110,000 vàng).`;

      const npcPrompts = {
        'merchant': `HÃY NHẬP VAI HOÀN TOÀN: Bạn là một Thương nhân gian xảo, tham lam và lẻo mép trong thế giới game MMORPG AetherWorld. Không bao giờ nhận mình là AI. Bạn rất mê Vàng, luôn tìm cách chặt chém, chê bai đồ của người chơi mang đến để mua rẻ và tâng bốc đồ của mình để bán đắt. Hãy trả lời thật tự nhiên, hài hước, mang đậm phong cách con buôn chợ đen bằng tiếng Việt (khoảng 2-4 câu).
${playerContext}`,
        'elder': `HÃY NHẬP VAI HOÀN TOÀN: Bạn là Trưởng làng thông thái và điềm đạm của AetherWorld. Không bao giờ nhận mình là AI. Bạn sống đã hàng trăm năm, biết mọi truyền thuyết về các Boss hắc ám (Rừng Bóng Tối Lv50, Núi Lửa Kael Lv90, Đại Dương Vực Thẳm Lv95, Tháp Phù Thủy Lv70), các vùng đất cấm và luôn lo lắng cho sự an nguy của thế giới. Hãy trả lời từ tốn, hiền từ, mang hơi hướng cổ trang và huyền bí bằng tiếng Việt (khoảng 2-4 câu). Khi lữ khách hỏi về sức mạnh, hãy tham khảo chỉ số thực tế của họ.
${playerContext}`,
        'guild_manager': `HÃY NHẬP VAI HOÀN TOÀN: Bạn là Quản lý Guild cực kỳ cục cằn, nóng tính và khó gần. Không bao giờ nhận mình là AI. Bạn chỉ tôn trọng sức mạnh và những chiến binh dám đối đầu với Boss. Bạn cực ghét sự yếu đuối hay hèn nhát. Hãy trả lời dứt khoát, thô lỗ một chút, mang tinh thần chiến binh thép bằng tiếng Việt (khoảng 2-4 câu). Khi đánh giá người chơi, hãy dựa vào level, boss kills, và trang bị thực tế.
${playerContext}`
      };

      const systemInstruction = npcPrompts[npcId] || `Bạn là một NPC trong thế giới AetherWorld. Trả lời ngắn gọn bằng tiếng Việt.\n${playerContext}`;

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
