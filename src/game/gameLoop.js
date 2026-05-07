const { ZONES } = require('../data/gameData');
const { guildBossState, soloBossState, players, roomMobs, getPlayersInZone } = require('../state/gameState');
const { randomInt, getPlayerStats } = require('../services/gameService');

function startGameLoop(io) {
  setInterval(() => {
    const now = Date.now();
    
    // --- BẮT ĐẦU TỐI ƯU HÓA: Lọc người chơi 1 lần duy nhất mỗi nhịp (tick) ---
    // Giảm độ phức tạp từ O(N * M) xuống O(N), tránh vòng lặp thừa cho mỗi phòng/Boss
    const activePlayersByZone = {};
    const activePlayersByRoom = {};
    const activePlayersByKey = {};

    players.forEach((pData, socketId) => {
        if (pData.isDead || !pData.currentZone) return;
        const pObj = { ...pData, socketId };
        
        if (!activePlayersByZone[pData.currentZone]) activePlayersByZone[pData.currentZone] = [];
        activePlayersByZone[pData.currentZone].push(pObj);

        if (pData.roomName) {
            if (!activePlayersByRoom[pData.roomName]) activePlayersByRoom[pData.roomName] = [];
            activePlayersByRoom[pData.roomName].push(pObj);
        }

        const idKey = pData.partyId ? pData.partyId : socketId;
        const soloKey = `${idKey}:${pData.currentZone}`;
        if (!activePlayersByKey[soloKey]) activePlayersByKey[soloKey] = [];
        activePlayersByKey[soloKey].push(pObj);
    });
    // --- KẾT THÚC TỐI ƯU HÓA ---

    // 1. Guild Bosses
    Object.keys(ZONES).forEach(zoneId => {
      const zone = ZONES[zoneId];
      if (zone.type !== 'guild') return;
      const boss = guildBossState[zoneId];
      if (!boss || boss.hp <= 0) return;
      const zonePlayers = activePlayersByZone[zoneId] || [];
      if (zonePlayers.length === 0) return;
      updateAndAttack(boss, zonePlayers, zoneId, zone, now, io, true);
    });

    // 2. Solo Bosses
    Object.keys(soloBossState).forEach(key => {
      const [id, zoneId] = key.split(':');
      const boss = soloBossState[key];
      if (!boss || boss.hp <= 0) return;
      
      const targetPlayers = activePlayersByKey[key] || [];
      
      if (targetPlayers.length === 0) return;
      const zone = ZONES[zoneId];
      const roomName = targetPlayers[0].partyId ? `zone:${zoneId}:${targetPlayers[0].partyId}` : `zone:${zoneId}:${targetPlayers[0].socketId}`;
      updateAndAttack(boss, targetPlayers, zoneId, zone, now, io.to(roomName), false);
    });

    // 3. Normal Mobs
    Object.keys(roomMobs).forEach(roomName => {
        const mobs = roomMobs[roomName];
        if (!mobs || mobs.length === 0) return;
        
        const roomPlayers = activePlayersByRoom[roomName] || [];
        if (roomPlayers.length === 0) return;

        let mobsMoved = false;
        mobs.forEach(mob => {
            if (mob.isDead) return;
            
            let nearestP = null;
            let minDist = Infinity;
            roomPlayers.forEach(p => {
                const dx = p.x - mob.x;
                const dy = p.y - mob.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < minDist) { minDist = dist; nearestP = p; }
            });
            
            if (nearestP && minDist < 300) {
                const speed = 25;
                if (minDist > 40) {
                    const angle = Math.atan2(nearestP.y - mob.y, nearestP.x - mob.x);
                    mob.x += Math.cos(angle) * speed;
                    mob.y += Math.sin(angle) * speed;
                    mobsMoved = true;
                }
                
                if (now - mob.lastAttack > 2000 && minDist <= 60) {
                    mob.lastAttack = now;
                    let dmg = randomInt(Math.floor(mob.attack * 0.8), Math.floor(mob.attack * 1.2));
                    
                    const pSock = nearestP.socketId;
                    const pData = players.get(pSock);
                    if (pData) {
                        const targetStats = getPlayerStats(pData);
                        dmg = Math.floor(dmg * (100 / (100 + targetStats.defensePct)));
                        pData.hp = Math.max(0, pData.hp - dmg);
                        pData.isDirty = true;
                        
                        io.to(roomName).emit('mob_attack', {
                            mobId: mob.id,
                            targetName: pData.name,
                            damage: dmg,
                            targetHp: pData.hp
                        });
                        
                        if (pData.hp <= 0) {
                            pData.isDead = true;
                            io.to(roomName).emit('sys_msg', { msg: `${pData.name} đã bị ${mob.name} tiêu diệt!` });
                            setTimeout(() => {
                                if (players.has(pSock)) {
                                    const p = players.get(pSock);
                                    p.isDead = false;
                                    p.hp = p.hpMax;
                                    p.currentZone = 'safezone';
                                    io.to(pSock).emit('sys_msg', { msg: 'Bạn đã hồi sinh tại Làng Khởi Nguyên.' });
                                    io.to(pSock).emit('force_move_zone', 'safezone');
                                }
                            }, 5000);
                        }
                    }
                }
            } else {
                if (Math.random() < 0.2) {
                    mob.x += randomInt(-20, 20);
                    mob.y += randomInt(-20, 20);
                    mob.x = Math.max(50, Math.min(750, mob.x));
                    mob.y = Math.max(50, Math.min(450, mob.y));
                    mobsMoved = true;
                }
            }
        });
        
        if (mobsMoved) {
            io.to(roomName).emit('mobs_moved', mobs.map(m => ({ id: m.id, x: m.x, y: m.y })));
        }
    });

    // (MP Regeneration is handled by a separate 15s interval)
  }, 1000);

  // 3. MP Regeneration Sync (Server Authoritative every 15s)
  setInterval(() => {
    const now = Date.now();
    players.forEach((pData, socketId) => {
      if (!pData.isDead && pData.mpMax) {
        if (!pData.lastRegenTime) pData.lastRegenTime = now;
        const dt = (now - pData.lastRegenTime) / 1000;
        pData.lastRegenTime = now;
        
        if (pData.mp < pData.mpMax) {
            pData.mp = Math.min(pData.mpMax, pData.mp + (pData.mpMax * 0.01 * dt));
        }
        const sock = io.sockets.sockets.get(socketId);
        if (sock) sock.emit('sync_mana', { mp: pData.mp, mpMax: pData.mpMax });
      }
    });
  }, 15000);

  function updateAndAttack(boss, targetPlayers, zoneId, zone, now, emitter, isGuild) {
    // Find nearest player
    let nearestP = null;
    let minDist = Infinity;
    targetPlayers.forEach(p => {
      if (p.isDead) return;
      const dx = p.x - boss.x;
      const dy = p.y - boss.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < minDist) { minDist = dist; nearestP = p; }
    });

    if (!nearestP) return;

    // Move towards nearest player (speed = 40px per sec)
    const speed = 40;
    if (minDist > 120) {
      const angle = Math.atan2(nearestP.y - boss.y, nearestP.x - boss.x);
      boss.x += Math.cos(angle) * speed;
      boss.y += Math.sin(angle) * speed;
      
      // Prevent NaN
      if (isNaN(boss.x) || isNaN(boss.y)) {
        boss.x = 650; boss.y = 120;
      }
    }

    // Always sync boss position to clients so they don't get stuck at 650,120
    if (isGuild) emitter.to(`zone:${zoneId}`).emit('boss_moved', { x: boss.x, y: boss.y, zoneId });
    else emitter.emit('boss_moved', { x: boss.x, y: boss.y, zoneId });

    // Attack logic with Berserk Mode
    const isBerserk = boss.hp <= zone.boss.hpMax * 0.25;
    const attackInterval = isBerserk ? 1000 : 2500;

    if (!boss.lastAttack) boss.lastAttack = now;
    if (now - boss.lastAttack >= attackInterval) {
      boss.lastAttack = now;
      let dmg = randomInt(zone.boss.attackDmgMin, zone.boss.attackDmgMax);
      let attackName = "Đánh thường";
      
      if (isBerserk && Math.random() < 0.3) {
          dmg *= 3;
          attackName = "Meteor Rain (Thiên Thạch Rơi)";
      }

      const ATTACK_RADIUS = 280; // Dodge radius

      // Trigger attack animation
      if (isGuild) emitter.to(`zone:${zoneId}`).emit('boss_attack_anim');
      else emitter.emit('boss_attack_anim');

      targetPlayers.forEach(p => {
        const pData = players.get(p.socketId);
        if (!pData || pData.isDead) return;
        const dx = pData.x - boss.x;
        const dy = pData.y - boss.y;
        const dist = Math.sqrt(dx*dx + dy*dy);

        const sock = io.sockets.sockets.get(p.socketId);

        if (dist <= ATTACK_RADIUS) {
          // HIT!
          // Apply MOBA armor formula (assume player armor = 5 for now)
          const playerArmor = 5;
          const actualDamage = Math.floor(dmg * (100 / (100 + playerArmor)));
          
          pData.hp = Math.max(0, pData.hp - actualDamage);
          if (sock) sock.emit('boss_attacks_you', { bossName: zone.boss.name, damage: actualDamage, attackName: attackName, playerHp: pData.hp, playerHpMax: pData.hpMax });
          
          if (isGuild) io.to(`zone:${zoneId}`).emit('player_hp_update', { name: pData.name, hp: pData.hp, hpMax: pData.hpMax });

          // Check death
          if (pData.hp <= 0 && !pData.isDead) {
            pData.isDead = true;
            if (sock) sock.emit('you_died', { killedBy: zone.boss.name });
            if (isGuild) io.to(`zone:${zoneId}`).emit('player_died_in_zone', { name: pData.name });
            setTimeout(() => {
              if (!players.has(p.socketId)) return;
              pData.isDead = false;
              pData.hp = pData.hpMax;
              pData.x = 100 + randomInt(0, 200);
              pData.y = 250 + randomInt(0, 150);
              if (sock) sock.emit('you_respawned', { hp: pData.hp, hpMax: pData.hpMax, x: pData.x, y: pData.y });
              if (isGuild && pData.currentZone === zoneId) {
                io.to(`zone:${zoneId}`).emit('player_respawned_in_zone', { name: pData.name, hp: pData.hp, hpMax: pData.hpMax, x: pData.x, y: pData.y });
              }
            }, 5000);
          }
        } else {
          // DODGED!
          if (sock) sock.emit('player_dodged', { bossName: zone.boss.name });
        }
      });
    }
  }
}

module.exports = { startGameLoop };
