const { players, activeTrades, counters } = require('../state/gameState');

function registerTradeHandlers(io, socket, savePlayerToDB) {
  // ---- TRADE SYSTEM ----
  socket.on('trade_request', (targetName) => {
    const player = players.get(socket.id);
    if (!player || !player.currentZone) return;
    
    let targetSocketId = null;
    players.forEach((p, sid) => {
      if (p.name === targetName && p.currentZone === player.currentZone) {
        targetSocketId = sid;
      }
    });

    if (!targetSocketId) return socket.emit('sys_msg', { msg: 'Người chơi không tồn tại hoặc không ở cùng khu vực.' });
    io.to(targetSocketId).emit('trade_request_received', { from: player.name, fromId: socket.id });
  });

  socket.on('trade_accept', (fromId) => {
    const player = players.get(socket.id);
    const initiator = players.get(fromId);
    if (!player || !initiator || player.currentZone !== initiator.currentZone) return;

    const tradeId = 'trade_' + (counters.tradeId++);
    activeTrades.set(tradeId, {
      p1: { id: fromId, name: initiator.name, items: [], gold: 0, ready: false },
      p2: { id: socket.id, name: player.name, items: [], gold: 0, ready: false }
    });

    initiator.currentTrade = tradeId;
    player.currentTrade = tradeId;

    io.to(fromId).emit('trade_started', { tradeId, partner: player.name });
    socket.emit('trade_started', { tradeId, partner: initiator.name });
  });

  socket.on('trade_offer', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.currentTrade) return;
    const trade = activeTrades.get(player.currentTrade);
    if (!trade) return;

    const { items, gold } = data;
    const mySide = trade.p1.id === socket.id ? trade.p1 : trade.p2;
    const otherSide = trade.p1.id === socket.id ? trade.p2 : trade.p1;

    // Xác thực gold
    if (gold > (player.gold || 0)) return socket.emit('sys_msg', { msg: 'Không đủ vàng để giao dịch!' });
    
    // Xác thực items
    const inv = player.inventory || [];
    let hasAllItems = true;
    for (const itemName of items) {
      if (!inv.find(i => i.name === itemName)) hasAllItems = false;
    }
    if (!hasAllItems) return socket.emit('sys_msg', { msg: 'Vật phẩm không hợp lệ!' });

    mySide.items = items;
    mySide.gold = gold;
    mySide.ready = false;
    otherSide.ready = false; // Hủy trạng thái sẵn sàng nếu có thay đổi

    io.to(otherSide.id).emit('trade_updated', { partnerItems: items, partnerGold: gold });
    socket.emit('trade_updated_self', { myItems: items, myGold: gold });
  });

  socket.on('trade_ready', () => {
    const player = players.get(socket.id);
    if (!player || !player.currentTrade) return;
    const trade = activeTrades.get(player.currentTrade);
    if (!trade) return;

    const mySide = trade.p1.id === socket.id ? trade.p1 : trade.p2;
    const otherSide = trade.p1.id === socket.id ? trade.p2 : trade.p1;
    mySide.ready = true;

    io.to(otherSide.id).emit('trade_partner_ready');
    socket.emit('trade_self_ready');

    // Nếu cả 2 cùng ready, tiến hành trao đổi
    if (mySide.ready && otherSide.ready) {
       const p1 = players.get(trade.p1.id);
       const p2 = players.get(trade.p2.id);

       // Trừ đồ và vàng
       p1.gold -= trade.p1.gold;
       p2.gold -= trade.p2.gold;
       
       const p1ItemsToGive = [];
       trade.p1.items.forEach(itemName => {
         const idx = p1.inventory.findIndex(i => i.name === itemName);
         if (idx > -1) p1ItemsToGive.push(p1.inventory.splice(idx, 1)[0]);
       });

       const p2ItemsToGive = [];
       trade.p2.items.forEach(itemName => {
         const idx = p2.inventory.findIndex(i => i.name === itemName);
         if (idx > -1) p2ItemsToGive.push(p2.inventory.splice(idx, 1)[0]);
       });

       // Thêm đồ và vàng cho đối phương
       p1.gold += trade.p2.gold;
       p2.gold += trade.p1.gold;
       p1.inventory.push(...p2ItemsToGive);
       p2.inventory.push(...p1ItemsToGive);

       p1.isDirty = true;
       p2.isDirty = true;
       p1.currentTrade = null;
       p2.currentTrade = null;
       activeTrades.delete(player.currentTrade);

       if (savePlayerToDB) {
           savePlayerToDB(p1).catch(console.error);
           savePlayerToDB(p2).catch(console.error);
       }

       io.to(trade.p1.id).emit('trade_success');
       io.to(trade.p2.id).emit('trade_success');
    }
  });

  socket.on('trade_cancel', () => {
    const player = players.get(socket.id);
    if (!player || !player.currentTrade) return;
    const tradeId = player.currentTrade;
    const trade = activeTrades.get(tradeId);
    if (trade) {
      if (players.has(trade.p1.id)) players.get(trade.p1.id).currentTrade = null;
      if (players.has(trade.p2.id)) players.get(trade.p2.id).currentTrade = null;
      io.to(trade.p1.id).emit('trade_cancelled');
      io.to(trade.p2.id).emit('trade_cancelled');
      activeTrades.delete(tradeId);
    }
  });
}

module.exports = registerTradeHandlers;
