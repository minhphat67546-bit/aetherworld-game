const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ====== GAME STATE ======
const NAMES_POOL = [
  'DragonSlayer', 'MoonWitch', 'IronFist', 'SilverArrow', 'StormMage',
  'DarkPaladin', 'NightHunter', 'FrostQueen', 'BloodKnight', 'ShadowPriest',
  'ThunderGod', 'PhoenixRider', 'GhostBlade', 'StarDancer', 'WarChief'
];

const CLASSES = ['Warrior', 'Mage', 'Rogue', 'Paladin', 'Hunter', 'Priest', 'Necromancer', 'Druid'];
const RACES = ['Human', 'Elf', 'Dwarf', 'Orc', 'Undead', 'Dragon-kin', 'Fae'];

const ZONES = {
  forest: {
    id: 'forest', name: 'Rừng Bóng Tối', type: 'solo',
    boss: { name: 'Treant Hắc Ám', level: 50, hpMax: 500000, difficulty: 'Hard', attackDmgMin: 500, attackDmgMax: 2500 }
  },
  volcano: {
    id: 'volcano', name: 'Vùng Núi Lửa Kael', type: 'guild',
    boss: { name: "Kael'thas Kẻ Gọi Lửa", level: 90, hpMax: 5000000, difficulty: 'Nightmare', attackDmgMin: 2000, attackDmgMax: 4000 }
  },
  ocean: {
    id: 'ocean', name: 'Đại Dương Vực Thẳm', type: 'guild',
    boss: { name: 'Kraken Bóng Đêm', level: 95, hpMax: 8000000, difficulty: 'Mythic', attackDmgMin: 3000, attackDmgMax: 5000 }
  },
  tower: {
    id: 'tower', name: 'Tháp Phù Thủy', type: 'solo',
    boss: { name: 'Lich Vĩnh Cửu', level: 70, hpMax: 1200000, difficulty: 'Hard', attackDmgMin: 800, attackDmgMax: 3000 }
  }
};

// Active players map: socketId -> playerData
const players = new Map();

// Zone boss state (shared for guild zones, per-player for solo)
const guildBossState = {}; // zoneId -> { hp, status, lastReset }
const soloBossState = {};  // `${socketId}:${zoneId}` -> { hp, status }

// Boss attack intervals per zone
const bossAttackTimers = {};

function resetGuildBoss(zoneId) {
  const zone = ZONES[zoneId];
  if (!zone || zone.type !== 'guild') return;
  guildBossState[zoneId] = { hp: zone.boss.hpMax, status: 'Đang hoạt động', lastReset: Date.now() };
}

// Initialize guild bosses
Object.keys(ZONES).forEach(zId => {
  if (ZONES[zId].type === 'guild') resetGuildBoss(zId);
});

function getBossState(socketId, zoneId) {
  const zone = ZONES[zoneId];
  if (!zone) return null;
  if (zone.type === 'guild') {
    return guildBossState[zoneId];
  } else {
    const key = `${socketId}:${zoneId}`;
    if (!soloBossState[key]) {
      soloBossState[key] = { hp: zone.boss.hpMax, status: 'Đang hoạt động' };
    }
    return soloBossState[key];
  }
}

function getPlayersInZone(zoneId) {
  const list = [];
  players.forEach((p, sid) => {
    if (p.currentZone === zoneId) list.push({ ...p, socketId: sid });
  });
  return list;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ====== SOCKET HANDLING ======
io.on('connection', (socket) => {
  console.log(`[+] Player connected: ${socket.id}`);

  // Assign a random character
  const playerName = NAMES_POOL[randomInt(0, NAMES_POOL.length - 1)] + '_' + randomInt(10, 99);
  const playerClass = CLASSES[randomInt(0, CLASSES.length - 1)];
  const playerRace = RACES[randomInt(0, RACES.length - 1)];
  const level = randomInt(60, 95);

  const playerData = {
    name: playerName,
    class: playerClass,
    race: playerRace,
    level,
    hp: 48000,
    hpMax: 48000,
    combatRating: randomInt(8000, 15000),
    currentZone: null
  };
  players.set(socket.id, playerData);

  // Send init data to the player
  socket.emit('init', {
    player: playerData,
    zones: Object.values(ZONES).map(z => ({
      id: z.id, name: z.name, type: z.type,
      boss: { name: z.boss.name, level: z.boss.level, hpMax: z.boss.hpMax, difficulty: z.boss.difficulty }
    })),
    onlineCount: players.size
  });

  // Broadcast updated online count
  io.emit('online_count', players.size);

  // ---- ENTER ZONE ----
  socket.on('enter_zone', (zoneId) => {
    const zone = ZONES[zoneId];
    if (!zone) return;

    const player = players.get(socket.id);
    if (!player) return;

    // Leave previous zone room
    if (player.currentZone) {
      socket.leave(`zone:${player.currentZone}`);
      if (ZONES[player.currentZone]?.type === 'guild') {
        io.to(`zone:${player.currentZone}`).emit('player_left_zone', {
          name: player.name, zoneId: player.currentZone,
          playersInZone: getPlayersInZone(player.currentZone).length
        });
      }
    }

    player.currentZone = zoneId;
    player.hp = player.hpMax; // heal on zone entry
    socket.join(`zone:${zoneId}`);

    const bossState = getBossState(socket.id, zoneId);

    // If guild boss is dead, respawn it
    if (zone.type === 'guild' && bossState.hp <= 0) {
      resetGuildBoss(zoneId);
    }

    const freshBoss = getBossState(socket.id, zoneId);

    socket.emit('zone_entered', {
      zoneId,
      zone: { id: zone.id, name: zone.name, type: zone.type, boss: zone.boss },
      bossHp: freshBoss.hp,
      bossStatus: freshBoss.status,
      player: { hp: player.hp, hpMax: player.hpMax },
      playersInZone: zone.type === 'guild' ? getPlayersInZone(zoneId).map(p => p.name) : [player.name]
    });

    // Notify others in guild zone
    if (zone.type === 'guild') {
      socket.to(`zone:${zoneId}`).emit('player_joined_zone', {
        name: player.name, zoneId,
        playersInZone: getPlayersInZone(zoneId).map(p => p.name)
      });
    }
  });

  // ---- ATTACK BOSS ----
  socket.on('attack', () => {
    const player = players.get(socket.id);
    if (!player || !player.currentZone) return;

    const zoneId = player.currentZone;
    const zone = ZONES[zoneId];
    if (!zone) return;

    const bossState = getBossState(socket.id, zoneId);
    if (!bossState || bossState.hp <= 0) return;

    // Damage calc
    const isCrit = Math.random() > 0.65;
    const baseDmg = randomInt(6000, 14000);
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
        io.to(`zone:${zoneId}`).emit('boss_killed', {
          killerName: player.name,
          bossName: zone.boss.name,
          zoneId
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
        socket.emit('boss_killed', { killerName: player.name, bossName: zone.boss.name, zoneId });
      }
    }

    // Boss counter-attack
    const bossDmg = randomInt(zone.boss.attackDmgMin, zone.boss.attackDmgMax);
    player.hp = Math.max(0, player.hp - bossDmg);
    // Small regen
    player.hp = Math.min(player.hpMax, player.hp + 500);

    socket.emit('boss_attacks_you', {
      bossName: zone.boss.name,
      damage: bossDmg,
      playerHp: player.hp,
      playerHpMax: player.hpMax
    });
  });

  // ---- LEAVE ZONE ----
  socket.on('leave_zone', () => {
    const player = players.get(socket.id);
    if (!player || !player.currentZone) return;

    const zoneId = player.currentZone;
    socket.leave(`zone:${zoneId}`);

    if (ZONES[zoneId]?.type === 'guild') {
      player.currentZone = null;
      socket.to(`zone:${zoneId}`).emit('player_left_zone', {
        name: player.name, zoneId,
        playersInZone: getPlayersInZone(zoneId).map(p => p.name)
      });
    } else {
      // Clean up solo boss state
      delete soloBossState[`${socket.id}:${zoneId}`];
      player.currentZone = null;
    }
  });

  // ---- DISCONNECT ----
  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    if (player && player.currentZone) {
      const zoneId = player.currentZone;
      socket.leave(`zone:${zoneId}`);
      if (ZONES[zoneId]?.type === 'guild') {
        io.to(`zone:${zoneId}`).emit('player_left_zone', {
          name: player.name, zoneId,
          playersInZone: getPlayersInZone(zoneId).map(p => p.name)
        });
      }
      // Clean up solo boss states
      Object.keys(soloBossState).forEach(key => {
        if (key.startsWith(socket.id)) delete soloBossState[key];
      });
    }
    players.delete(socket.id);
    io.emit('online_count', players.size);
    console.log(`[-] Player disconnected: ${socket.id} (${player?.name})`);
  });
});

// ====== PERIODIC BOSS ATTACKS (guild zones) ======
// Every 3 seconds, guild bosses attack all players in their zone
setInterval(() => {
  Object.keys(ZONES).forEach(zoneId => {
    const zone = ZONES[zoneId];
    if (zone.type !== 'guild') return;
    const bossState = guildBossState[zoneId];
    if (!bossState || bossState.hp <= 0) return;

    const zonePlayers = getPlayersInZone(zoneId);
    if (zonePlayers.length === 0) return;

    // Boss area attack
    const dmg = randomInt(zone.boss.attackDmgMin, zone.boss.attackDmgMax);
    zonePlayers.forEach(p => {
      const playerData = players.get(p.socketId);
      if (!playerData) return;
      playerData.hp = Math.max(0, playerData.hp - dmg);
      playerData.hp = Math.min(playerData.hpMax, playerData.hp + 300); // small regen

      const sock = io.sockets.sockets.get(p.socketId);
      if (sock) {
        sock.emit('boss_attacks_you', {
          bossName: zone.boss.name,
          damage: dmg,
          playerHp: playerData.hp,
          playerHpMax: playerData.hpMax
        });
      }
    });

    // Broadcast boss attack to zone log
    io.to(`zone:${zoneId}`).emit('boss_zone_attack', {
      bossName: zone.boss.name,
      damage: dmg,
      targets: zonePlayers.length
    });
  });
}, 4000);

// ====== SERVE STATIC BUILD ======
app.use(express.static(path.join(__dirname, 'game-ui', 'dist')));
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'game-ui', 'dist', 'index.html'));
});

// ====== START ======
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎮 AetherWorld Server đang chạy tại http://localhost:${PORT}`);
  console.log(`📡 Sẵn sàng nhận kết nối multiplayer!\n`);
});
