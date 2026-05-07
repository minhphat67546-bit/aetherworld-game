const { ZONES, SKILLS_DB, ROLE_STATS } = require('../data/gameData');
const { players, getBossState, resetGuildBoss, getPlayersInZone, parties, roomMobs } = require('../state/gameState');
const { getPlayerStats, generateLoot, randomInt } = require('../services/gameService');

function registerCombatHandlers(io, socket) {
  const handleBossAttack = (socketId, dmgMulti = 1.0) => {
    const player = players.get(socketId);
    if (!player || !player.currentZone || player.isDead) return;

    const zoneId = player.currentZone;
    const zone = ZONES[zoneId];
    if (!zone || !zone.boss) return;

    const bossState = getBossState(socketId, zoneId);
    if (!bossState || bossState.hp <= 0) return;

    const stats = getPlayerStats(player);
    
    // Total raw damage
    const isCrit = Math.random() > 0.65;
    const minDmg = Math.floor(stats.attack * 0.9 * dmgMulti);
    const maxDmg = Math.floor(stats.attack * 1.1 * dmgMulti);
    const baseDmg = randomInt(minDmg, maxDmg);
    const totalRawDamage = isCrit ? Math.floor(baseDmg * 2.1) : baseDmg;

    // Apply armor formula: Damage = Raw * (100 / (100 + Armor))
    const bossArmor = zone.boss.armor || 40;
    const finalDmg = Math.floor(totalRawDamage * (100 / (100 + bossArmor)));

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
      io.to(player.roomName).emit('attack_result', attackResult);
      if (bossState.hp <= 0) {
        const loot = generateLoot(zoneId);
        
        // Random Race Change Token for everyone in zone
        if (Math.random() < 0.3) { // 30% chance
           loot.items.push({ name: 'Thẻ Đổi Tộc', rarity: 'legendary', icon: '🎭', type: 'Đặc biệt', rarityLabel: '🟧 Legendary', color: '#ff9f1c' });
        }

        io.to(player.roomName).emit('boss_killed', {
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
          io.to(player.roomName).emit('boss_respawned', {
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
  };

  // ---- USE SKILL ----
  socket.on('use_skill', (data) => {
    const { skillKey } = data;
    const player = players.get(socket.id);
    if (!player || player.isDead) return;

    const skillMap = SKILLS_DB[player.race] || SKILLS_DB['Human'];
    const skill = skillMap[skillKey];
    
    if (skill) {
      // Lazy Evaluation
      const now = Date.now();
      if (!player.lastRegenTime) player.lastRegenTime = now;
      const dt = (now - player.lastRegenTime) / 1000;
      player.lastRegenTime = now;
      
      if (player.mp < player.mpMax) {
          player.mp = Math.min(player.mpMax, player.mp + (player.mpMax * 0.01 * dt));
      }

      // Server Authoritative MP Check
      if (player.mp < skill.manaCost) {
          socket.emit('sys_msg', { msg: "Lỗi đồng bộ: Không đủ Năng lượng!" });
          socket.emit('sync_mana', { mp: player.mp, mpMax: player.mpMax });
          return;
      }
      player.mp -= skill.manaCost;
      socket.emit('sync_mana', { mp: player.mp, mpMax: player.mpMax });

      if (skill.type === 'attack' || skill.type === 'ultimate' || skill.type === 'aoe') {
         handleBossAttack(socket.id, skill.dmgMulti || 1.0);
      } else {
         socket.emit('sys_msg', { msg: `Đã dùng: ${skill.name}` });
      }
    }
  });

  // ---- ATTACK BOSS ----
  socket.on('attack', () => {
      const player = players.get(socket.id);
      if (!player) return;
      
      const now = Date.now();
      if (player.lastBasicAttack && now - player.lastBasicAttack < 1000) return;
      player.lastBasicAttack = now;

      const roleStats = ROLE_STATS[player.race] || ROLE_STATS['Human'];
      handleBossAttack(socket.id, roleStats.basicAttackMulti || 1.0);
  });

  // ---- ATTACK MOB ----
  socket.on('attack_mob', (mobId) => {
      const player = players.get(socket.id);
      if (!player || !player.currentZone || player.isDead || !player.roomName) return;

      const mobs = roomMobs[player.roomName];
      if (!mobs) return;

      const mob = mobs.find(m => m.id === mobId);
      if (!mob || mob.isDead) return;

      const now = Date.now();
      if (player.lastBasicAttack && now - player.lastBasicAttack < 1000) return;
      player.lastBasicAttack = now;

      const roleStats = ROLE_STATS[player.race] || ROLE_STATS['Human'];

      const dx = player.x - mob.x;
      const dy = player.y - mob.y;
      const attackRange = roleStats.attackRange || 150;
      if (Math.sqrt(dx*dx + dy*dy) > attackRange) return socket.emit('sys_msg', { msg: 'Mục tiêu quá xa!' });

      const stats = getPlayerStats(player);
      const isCrit = Math.random() > 0.65;
      const dmgMulti = roleStats.basicAttackMulti || 1.0;
      
      const minDmg = Math.floor(stats.attack * 0.9 * dmgMulti);
      const maxDmg = Math.floor(stats.attack * 1.1 * dmgMulti);
      const baseDmg = randomInt(minDmg, maxDmg);
      const finalDmg = isCrit ? Math.floor(baseDmg * 2.1) : baseDmg;

      mob.hp = Math.max(0, mob.hp - finalDmg);

      io.to(player.roomName).emit('mob_attack_result', {
          attackerName: player.name,
          mobId: mob.id,
          damage: finalDmg,
          isCrit,
          mobHp: mob.hp
      });

      if (mob.hp <= 0) {
          mob.isDead = true;
          
          // Generate loot
          const loot = generateLoot(mob.dropTable);
          // Scale down loot for mobs
          loot.gold = Math.floor(loot.gold * 0.1); // 10% gold compared to boss
          // 80% chance to drop nothing but gold
          if (Math.random() < 0.8) loot.items = [];

          player.level += 1; // Or add XP system later. For now, 1 kill = 1 level to match old logic, but let's just do gold & items.
          player.gold = (player.gold || 0) + loot.gold;
          player.inventory = [...(player.inventory || []), ...loot.items.map(i => ({ name: i.name, rarity: i.rarity, icon: i.icon, type: i.type }))];
          player.isDirty = true;

          socket.emit('mob_killed', {
              mobId: mob.id,
              mobName: mob.name,
              loot,
              newLevel: player.level
          });
          
          // Remove dead mob after a short delay
          setTimeout(() => {
             const roomMobsArr = roomMobs[player.roomName];
             if (roomMobsArr) {
                 const idx = roomMobsArr.findIndex(m => m.id === mob.id);
                 if (idx !== -1) roomMobsArr.splice(idx, 1);
             }
          }, 1000);
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
    
    io.to(player.roomName).emit('pvp_attack_result', {
      attacker: player.name,
      target: targetPlayer.name,
      damage: finalDmg,
      isCrit,
      targetHp: targetPlayer.hp
    });

    if (targetPlayer.hp <= 0) {
      targetPlayer.isDead = true;
      targetPlayer.hp = 0;
      io.to(player.roomName).emit('sys_msg', { msg: `${player.name} đã hạ gục ${targetPlayer.name}!` });
      
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
