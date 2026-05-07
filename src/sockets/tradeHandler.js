const { players } = require('../state/gameState');

const activeTrades = new Map(); // tradeSessionId -> tradeData

function generateTradeId() {
    return 'trade_' + Math.random().toString(36).substr(2, 9);
}

module.exports = function(io, socket, savePlayerToDB) {
    socket.on('trade_request', (data) => {
        const { targetName } = data;
        const requester = players.get(socket.id);
        if (!requester) return;

        // Tìm target socket
        let targetSocketId = null;
        for (const [sId, p] of players.entries()) {
            if (p.name === targetName && sId !== socket.id && !p.isDead && p.currentZone === requester.currentZone) {
                targetSocketId = sId;
                break;
            }
        }

        if (targetSocketId) {
            io.to(targetSocketId).emit('trade_requested', { requesterName: requester.name });
        } else {
            socket.emit('sys_msg', { msg: "Người chơi không tồn tại hoặc không ở cùng khu vực." });
        }
    });

    socket.on('trade_accept', (data) => {
        const { targetName } = data;
        const accepter = players.get(socket.id);
        if (!accepter) return;

        let requesterSocketId = null;
        let requesterName = '';
        for (const [sId, p] of players.entries()) {
            if (p.name === targetName && sId !== socket.id) {
                requesterSocketId = sId;
                requesterName = p.name;
                break;
            }
        }

        if (requesterSocketId) {
            const tradeId = generateTradeId();
            activeTrades.set(tradeId, {
                p1: { socketId: requesterSocketId, name: requesterName, gold: 0, items: [], locked: false },
                p2: { socketId: socket.id, name: accepter.name, gold: 0, items: [], locked: false }
            });
            
            // Lưu tradeId vào player để tiện tra cứu
            players.get(requesterSocketId).tradeId = tradeId;
            accepter.tradeId = tradeId;

            io.to(requesterSocketId).emit('trade_started', { partnerName: accepter.name });
            socket.emit('trade_started', { partnerName: requesterName });
        }
    });

    socket.on('trade_decline', (data) => {
        const { targetName } = data;
        for (const [sId, p] of players.entries()) {
            if (p.name === targetName && sId !== socket.id) {
                io.to(sId).emit('trade_declined', { targetName: players.get(socket.id)?.name || 'Người chơi' });
                break;
            }
        }
    });

    socket.on('trade_update_offer', (data) => {
        const player = players.get(socket.id);
        if (!player || !player.tradeId) return;
        const trade = activeTrades.get(player.tradeId);
        if (!trade) return;

        const isP1 = trade.p1.socketId === socket.id;
        const me = isP1 ? trade.p1 : trade.p2;
        const them = isP1 ? trade.p2 : trade.p1;

        if (me.locked) return; // Không thể sửa khi đã khóa

        if (data.gold !== undefined) {
            me.gold = Math.min(Math.max(0, data.gold), player.gold); // Không được vượt quá số vàng đang có
        }

        // Broadcast update to both
        io.to(them.socketId).emit('trade_update', {
            myGold: them.gold, myItems: them.items, myLocked: them.locked,
            theirGold: me.gold, theirItems: me.items, theirLocked: me.locked
        });
        socket.emit('trade_update', {
            myGold: me.gold, myItems: me.items, myLocked: me.locked,
            theirGold: them.gold, theirItems: them.items, theirLocked: them.locked
        });
    });

    socket.on('trade_add_item', (data) => {
        const player = players.get(socket.id);
        if (!player || !player.tradeId) return;
        const trade = activeTrades.get(player.tradeId);
        if (!trade) return;

        const isP1 = trade.p1.socketId === socket.id;
        const me = isP1 ? trade.p1 : trade.p2;
        const them = isP1 ? trade.p2 : trade.p1;

        if (me.locked) return;
        
        // Un-lock both if someone changes items (Anti-scam)
        me.locked = false;
        them.locked = false;

        const itemIndex = data.index;
        if (player.inventory[itemIndex]) {
            // Check if already added
            if (!me.items.find(i => i.originalIndex === itemIndex)) {
                me.items.push({ ...player.inventory[itemIndex], originalIndex: itemIndex });
            }
        }

        syncTrade(io, socket, me, them);
    });

    socket.on('trade_remove_item', (data) => {
        const player = players.get(socket.id);
        if (!player || !player.tradeId) return;
        const trade = activeTrades.get(player.tradeId);
        if (!trade) return;

        const isP1 = trade.p1.socketId === socket.id;
        const me = isP1 ? trade.p1 : trade.p2;
        const them = isP1 ? trade.p2 : trade.p1;

        if (me.locked) return;
        
        // Un-lock both
        me.locked = false;
        them.locked = false;

        me.items = me.items.filter(i => i.originalIndex !== data.index);
        syncTrade(io, socket, me, them);
    });

    socket.on('trade_lock', () => {
        const player = players.get(socket.id);
        if (!player || !player.tradeId) return;
        const trade = activeTrades.get(player.tradeId);
        if (!trade) return;

        const isP1 = trade.p1.socketId === socket.id;
        const me = isP1 ? trade.p1 : trade.p2;
        const them = isP1 ? trade.p2 : trade.p1;

        // Double check gold balance before locking
        if (me.gold > player.gold) me.gold = player.gold;

        me.locked = !me.locked; // Toggle lock
        
        syncTrade(io, socket, me, them);
    });

    socket.on('trade_confirm', () => {
        const player = players.get(socket.id);
        if (!player || !player.tradeId) return;
        const trade = activeTrades.get(player.tradeId);
        if (!trade) return;

        const isP1 = trade.p1.socketId === socket.id;
        const me = isP1 ? trade.p1 : trade.p2;
        const them = isP1 ? trade.p2 : trade.p1;

        if (!me.locked || !them.locked) return; // Cả hai phải khóa

        me.confirmed = true;

        if (me.confirmed && them.confirmed) {
            executeTrade(io, trade.p1, trade.p2, savePlayerToDB);
            activeTrades.delete(player.tradeId);
        }
    });

    socket.on('trade_cancel', () => {
        const player = players.get(socket.id);
        if (!player || !player.tradeId) return;
        const trade = activeTrades.get(player.tradeId);
        if (trade) {
            io.to(trade.p1.socketId).emit('trade_cancelled', { msg: 'Giao dịch đã bị hủy.' });
            io.to(trade.p2.socketId).emit('trade_cancelled', { msg: 'Giao dịch đã bị hủy.' });
            
            const p1 = players.get(trade.p1.socketId);
            const p2 = players.get(trade.p2.socketId);
            if (p1) p1.tradeId = null;
            if (p2) p2.tradeId = null;

            activeTrades.delete(player.tradeId);
        }
    });
}

function syncTrade(io, socket, me, them) {
    io.to(them.socketId).emit('trade_update', {
        myGold: them.gold, myItems: them.items, myLocked: them.locked,
        theirGold: me.gold, theirItems: me.items, theirLocked: me.locked
    });
    socket.emit('trade_update', {
        myGold: me.gold, myItems: me.items, myLocked: me.locked,
        theirGold: them.gold, theirItems: them.items, theirLocked: them.locked
    });
}

function executeTrade(io, p1Trade, p2Trade, savePlayerToDB) {
    const p1 = players.get(p1Trade.socketId);
    const p2 = players.get(p2Trade.socketId);
    if (!p1 || !p2) return;

    // --- SERVER AUTHORITATIVE DOUBLE CHECK ---
    // 1. Kiểm tra Vàng
    if (p1.gold < p1Trade.gold || p2.gold < p2Trade.gold) {
        cancelDueToError(io, p1Trade.socketId, p2Trade.socketId, p1, p2, "Lỗi xác thực: Một bên không đủ Vàng!");
        return;
    }
    
    // 2. Kiểm tra Vật phẩm (Dựa trên originalIndex và tên)
    const p1ValidItems = p1Trade.items.every(it => p1.inventory[it.originalIndex] && p1.inventory[it.originalIndex].name === it.name);
    const p2ValidItems = p2Trade.items.every(it => p2.inventory[it.originalIndex] && p2.inventory[it.originalIndex].name === it.name);

    if (!p1ValidItems || !p2ValidItems) {
        cancelDueToError(io, p1Trade.socketId, p2Trade.socketId, p1, p2, "Lỗi xác thực: Một bên không còn đủ vật phẩm (Đã lén dùng hoặc quăng đồ)!");
        return;
    }

    // --- EXECUTE TRANSFER ---
    p1.gold = p1.gold - p1Trade.gold + p2Trade.gold;
    p2.gold = p2.gold - p2Trade.gold + p1Trade.gold;

    // Lọc bỏ vật phẩm cũ
    const p1RemainingInv = p1.inventory.filter((_, idx) => !p1Trade.items.find(it => it.originalIndex === idx));
    const p2RemainingInv = p2.inventory.filter((_, idx) => !p2Trade.items.find(it => it.originalIndex === idx));

    // Nhận vật phẩm mới (Xóa originalIndex để sạch data)
    const cleanP1Receive = p2Trade.items.map(i => { delete i.originalIndex; return i; });
    const cleanP2Receive = p1Trade.items.map(i => { delete i.originalIndex; return i; });

    p1.inventory = [...p1RemainingInv, ...cleanP1Receive];
    p2.inventory = [...p2RemainingInv, ...cleanP2Receive];

    p1.isDirty = true;
    p2.isDirty = true;
    p1.tradeId = null;
    p2.tradeId = null;

    io.to(p1Trade.socketId).emit('trade_completed');
    io.to(p2Trade.socketId).emit('trade_completed');
    
    // Update inventories on clients
    io.to(p1Trade.socketId).emit('inventory_data', { inventory: p1.inventory, gold: p1.gold });
    io.to(p2Trade.socketId).emit('inventory_data', { inventory: p2.inventory, gold: p2.gold });
    
    // Save to DB
    if (typeof savePlayerToDB === 'function') {
        savePlayerToDB(p1);
        savePlayerToDB(p2);
    }
}

function cancelDueToError(io, s1, s2, p1, p2, msg) {
    io.to(s1).emit('trade_cancelled', { msg });
    io.to(s2).emit('trade_cancelled', { msg });
    if (p1) p1.tradeId = null;
    if (p2) p2.tradeId = null;
}
