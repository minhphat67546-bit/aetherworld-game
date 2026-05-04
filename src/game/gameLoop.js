const { ZONES } = require('../data/gameData');
const { guildBossState, soloBossState, players, getPlayersInZone } = require('../state/gameState');
const { randomInt } = require('../services/gameService');

function startGameLoop(io) {
  setInterval(() => {
    const now = Date.now();
    
    // 1. Guild Bosses
    Object.keys(ZONES).forEach(zoneId => {
      const zone = ZONES[zoneId];
      if (zone.type !== 'guild') return;
      const boss = guildBossState[zoneId];
      if (!boss || boss.hp <= 0) return;
      const zonePlayers = getPlayersInZone(zoneId);
      if (zonePlayers.length === 0) return;
      updateAndAttack(boss, zonePlayers, zoneId, zone, now, io, true);
    });

    // 2. Solo Bosses
    Object.keys(soloBossState).forEach(key => {
      const [socketId, zoneId] = key.split(':');
      const boss = soloBossState[key];
      if (!boss || boss.hp <= 0) return;
      const pData = players.get(socketId);
      if (!pData || pData.currentZone !== zoneId || pData.isDead) return;
      const zone = ZONES[zoneId];
      const sock = io.sockets.sockets.get(socketId);
      if (!sock) return;
      updateAndAttack(boss, [{ ...pData, socketId }], zoneId, zone, now, sock, false);
    });
  }, 1000);

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

    // Attack every 3.5 seconds
    if (!boss.lastAttack) boss.lastAttack = now;
    if (now - boss.lastAttack >= 3500) {
      boss.lastAttack = now;
      const dmg = randomInt(zone.boss.attackDmgMin, zone.boss.attackDmgMax);
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
          pData.hp = Math.max(0, pData.hp - dmg);
          if (sock) sock.emit('boss_attacks_you', { bossName: zone.boss.name, damage: dmg, playerHp: pData.hp, playerHpMax: pData.hpMax });
          
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
