const { ZONES } = require('../data/gameData');
const { players, getBossState, resetGuildBoss, getPlayersInZone, parties } = require('../state/gameState');
const { getPlayerStats, generateLoot, randomInt } = require('../services/gameService');

function registerCombatHandlers(io, socket) {
  // ---- ATTACK BOSS ----
  socket.on('attack', () => {
    const player = players.get(socket.id);
    if (!player || !player.currentZone || player.isDead) return;

    const zoneId = player.currentZone;
    const zone = ZONES[zoneId];
    if (!zone) return;

    const bossState = getBossState(socket.id, zoneId);
    if (!bossState || bossState.hp <= 0) return;

    const stats = getPlayerStats(player);
    // Damage calc
    const isCrit = Math.random() > 0.65;
    const minDmg = Math.floor(stats.attack * 0.9);
    const maxDmg = Math.floor(stats.attack * 1.1);
    const baseDmg = randomInt(minDmg, maxDmg);
    const finalDmg = isCrit ? Math.floor(baseDmg * 2.1) : baseDmg;

    bossState.hp = Math.max(0, bossState.hp - finalDmg);
    if (bossState.hp <= 0) bossState.status = 'Đã bị tiêu diệt';

    const attackResult = {
      attackerName: player.name,
      damage: finalDmg,
      isCrit,
      bossHp: bossState.hp,
      bossHpMax: zone.boss.hpMax,
      bossStatus: bossState.status,
      timestamp: Date.now()
    };

    if (zone.type === 'guild') {
      // Broadcast to entire zone
      io.to(`zone:${zoneId}`).emit('attack_result', attackResult);
      if (bossState.hp <= 0) {
        const loot = generateLoot(zoneId);
        
        // Random Race Change Token for everyone in zone
        if (Math.random() < 0.3) { // 30% chance
           loot.items.push({ name: 'Thẻ Đổi Tộc', rarity: 'legendary', icon: '🎭', type: 'Đặc biệt', rarityLabel: '🟧 Legendary', color: '#ff9f1c' });
        }

        io.to(`zone:${zoneId}`).emit('boss_killed', {
          killerName: player.name,
          bossName: zone.boss.name,
          zoneId,
          loot,
          levelUpInfo: true // flag to tell client they leveled up
        });
        // Save loot for all players in zone
        const zonePlayers = getPlayersInZone(zoneId);
        zonePlayers.forEach(p => {
          const pd = players.get(p.socketId);
          if (pd) {
            pd.level += 1;
            pd.gold = (pd.gold || 0) + loot.gold;
            pd.inventory = [...(pd.inventory || []), ...loot.items.map(i => ({ name: i.name, rarity: i.rarity, icon: i.icon, type: i.type }))];
            pd.bossKills = (pd.bossKills || 0) + 1;
            pd.isDirty = true; // Use dirty flag instead of immediate save
          }
        });
        // Respawn boss after 15 seconds
        setTimeout(() => {
          resetGuildBoss(zoneId);
          io.to(`zone:${zoneId}`).emit('boss_respawned', {
            bossName: zone.boss.name,
            bossHp: zone.boss.hpMax,
            zoneId
          });
        }, 15000);
      }
    } else {
      // Solo: only send to this player
      socket.emit('attack_result', attackResult);
      if (bossState.hp <= 0) {
        const loot = generateLoot(zoneId);
        
        // Level up and random Race Change Token
        player.level += 1;
        if (Math.random() < 0.3) { // 30% chance
           loot.items.push({ name: 'Thẻ Đổi Tộc', rarity: 'legendary', icon: '🎭', type: 'Đặc biệt', rarityLabel: '🟧 Legendary', color: '#ff9f1c' });
        }

        if (player.partyId && parties.has(player.partyId)) {
          // Party mode sharing
          const party = parties.get(player.partyId);
          const membersInZone = party.members.filter(mId => {
             const p = players.get(mId);
             return p && p.currentZone === zoneId;
          });
          
          const goldPerMember = Math.floor(loot.gold / membersInZone.length);
          
          membersInZone.forEach((mId, index) => {
             const p = players.get(mId);
             p.level += 1;
             p.gold = (p.gold || 0) + goldPerMember;
             p.bossKills = (p.bossKills || 0) + 1;
             
             // Randomly distribute items among members
             const myLoot = loot.items.filter((_, i) => i % membersInZone.length === index);
             p.inventory = [...(p.inventory || []), ...myLoot.map(i => ({ name: i.name, rarity: i.rarity, icon: i.icon, type: i.type }))];
             p.isDirty = true;
             
             io.to(mId).emit('boss_killed', { killerName: player.name, bossName: zone.boss.name, zoneId, loot: { items: myLoot, gold: goldPerMember }, newLevel: p.level });
             io.to(mId).emit('sys_msg', { msg: `Tổ đội đã tiêu diệt ${zone.boss.name}!` });
          });
        } else {
          socket.emit('boss_killed', { killerName: player.name, bossName: zone.boss.name, zoneId, loot, newLevel: player.level });
          player.gold = (player.gold || 0) + loot.gold;
          player.inventory = [...(player.inventory || []), ...loot.items.map(i => ({ name: i.name, rarity: i.rarity, icon: i.icon, type: i.type }))];
          player.bossKills = (player.bossKills || 0) + 1;
          player.isDirty = true;
        }
      }
    }
  });

  // ---- PVP SYSTEM ----
  socket.on('pvp_attack', (targetName) => {
    const player = players.get(socket.id);
    if (!player || !player.currentZone || player.isDead) return;
    
    const zone = ZONES[player.currentZone];
    if (!zone || zone.type !== 'pvp') {
       return socket.emit('sys_msg', { msg: 'Bạn không thể tấn công ở khu vực này.' });
    }

    let targetSocketId = null;
    let targetPlayer = null;
    players.forEach((p, sid) => {
      if (p.name === targetName && p.currentZone === player.currentZone && !p.isDead) {
        targetSocketId = sid;
        targetPlayer = p;
      }
    });

    if (!targetPlayer) return;

    const dx = player.x - targetPlayer.x;
    const dy = player.y - targetPlayer.y;
    if (Math.sqrt(dx*dx + dy*dy) > 100) return socket.emit('sys_msg', { msg: 'Mục tiêu quá xa!' });

    const stats = getPlayerStats(player);
    const isCrit = Math.random() > 0.65;
    const baseDmg = randomInt(Math.floor(stats.attack * 0.9), Math.floor(stats.attack * 1.1));
    const finalDmg = isCrit ? Math.floor(baseDmg * 2.1) : baseDmg;

    targetPlayer.hp -= finalDmg;
    targetPlayer.isDirty = true;
    
    io.to(`zone:${player.currentZone}`).emit('pvp_attack_result', {
      attacker: player.name,
      target: targetPlayer.name,
      damage: finalDmg,
      isCrit,
      targetHp: targetPlayer.hp
    });

    if (targetPlayer.hp <= 0) {
      targetPlayer.isDead = true;
      targetPlayer.hp = 0;
      io.to(`zone:${player.currentZone}`).emit('sys_msg', { msg: `${player.name} đã hạ gục ${targetPlayer.name}!` });
      
      setTimeout(() => {
        if (players.has(targetSocketId)) {
           const p = players.get(targetSocketId);
           p.isDead = false;
           p.hp = p.hpMax;
           p.currentZone = 'safezone';
           io.to(targetSocketId).emit('sys_msg', { msg: 'Bạn đã hồi sinh tại Làng Khởi Nguyên.' });
           // Force client to handle safezone move
           io.to(targetSocketId).emit('force_move_zone', 'safezone');
        }
      }, 5000);
    }
  });
}

module.exports = registerCombatHandlers;
