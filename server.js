const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ====== MONGODB ======
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aetherworld_db';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_change_me';
let db = null;

async function connectDB() {
  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db();
    // Create indexes
    await db.collection('users').createIndex({ username: 1 }, { unique: true });
    console.log('✅ MongoDB kết nối thành công!');
  } catch (err) {
    console.warn('⚠️  MongoDB không khả dụng, dữ liệu sẽ chỉ lưu trong RAM:', err.message);
  }
}
connectDB();

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

// ====== LOOT TABLES ======
const RARITY = { common: '⬜ Common', rare: '🟦 Rare', epic: '🟪 Epic', legendary: '🟧 Legendary' };
const RARITY_COLORS = { common: '#adb5bd', rare: '#4895ef', epic: '#9d4edd', legendary: '#ff9f1c' };

const LOOT_TABLES = {
  forest: [
    { name: 'Lá Cây Hắc Ám', rarity: 'common', icon: '🍃', type: 'Nguyên liệu' },
    { name: 'Nhựa Treant Cổ Đại', rarity: 'rare', icon: '🧪', type: 'Nguyên liệu' },
    { name: 'Rìu Rễ Cây Ma', rarity: 'rare', icon: '🪓', type: 'Vũ khí' },
    { name: 'Giáp Vỏ Cây Thiêng', rarity: 'epic', icon: '🛡️', type: 'Giáp' },
    { name: 'Hạt Giống Thế Giới', rarity: 'legendary', icon: '🌟', type: 'Huyền thoại' },
  ],
  volcano: [
    { name: 'Mảnh Obsidian', rarity: 'common', icon: '�ite', type: 'Nguyên liệu' },
    { name: 'Lông Phượng Hoàng Lửa', rarity: 'rare', icon: '🪶', type: 'Nguyên liệu' },
    { name: 'Kiếm Nham Thạch', rarity: 'rare', icon: '⚔️', type: 'Vũ khí' },
    { name: 'Áo Choàng Ngọn Lửa', rarity: 'epic', icon: '🧥', type: 'Giáp' },
    { name: 'Vương Miện Kael\'thas', rarity: 'epic', icon: '👑', type: 'Phụ kiện' },
    { name: 'Cánh Phượng Hoàng Bất Diệt', rarity: 'legendary', icon: '🔥', type: 'Huyền thoại' },
  ],
  ocean: [
    { name: 'Vảy Kraken', rarity: 'common', icon: '🐚', type: 'Nguyên liệu' },
    { name: 'Ngọc Trai Vực Thẳm', rarity: 'rare', icon: '💎', type: 'Nguyên liệu' },
    { name: 'Đinh Ba Thủy Triều', rarity: 'rare', icon: '🔱', type: 'Vũ khí' },
    { name: 'Giáp Biển Sâu', rarity: 'epic', icon: '🛡️', type: 'Giáp' },
    { name: 'Mắt Kraken', rarity: 'epic', icon: '👁️', type: 'Phụ kiện' },
    { name: 'Trident Chúa Tể Đại Dương', rarity: 'legendary', icon: '🌊', type: 'Huyền thoại' },
  ],
  tower: [
    { name: 'Bụi Ma Thuật', rarity: 'common', icon: '✨', type: 'Nguyên liệu' },
    { name: 'Sách Phép Cổ', rarity: 'rare', icon: '📕', type: 'Nguyên liệu' },
    { name: 'Gậy Linh Hồn', rarity: 'rare', icon: '🪄', type: 'Vũ khí' },
    { name: 'Áo Bào Lich Vương', rarity: 'epic', icon: '🧙', type: 'Giáp' },
    { name: 'Phylactery Vĩnh Cửu', rarity: 'legendary', icon: '💀', type: 'Huyền thoại' },
  ]
};

function generateLoot(zoneId) {
  const table = LOOT_TABLES[zoneId] || [];
  const drops = [];
  const numDrops = randomInt(2, 4);
  const gold = randomInt(5000, 50000);
  
  for (let i = 0; i < numDrops; i++) {
    // Weighted random by rarity
    const roll = Math.random();
    let pool;
    if (roll < 0.05) pool = table.filter(i => i.rarity === 'legendary');
    else if (roll < 0.25) pool = table.filter(i => i.rarity === 'epic');
    else if (roll < 0.55) pool = table.filter(i => i.rarity === 'rare');
    else pool = table.filter(i => i.rarity === 'common');
    
    if (pool.length === 0) pool = table;
    const item = pool[randomInt(0, pool.length - 1)];
    // Avoid duplicates
    if (!drops.find(d => d.name === item.name)) {
      drops.push({ ...item, id: Date.now() + '_' + i, rarityLabel: RARITY[item.rarity], color: RARITY_COLORS[item.rarity] });
    }
  }
  return { items: drops, gold };
}

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
  guildBossState[zoneId] = { hp: zone.boss.hpMax, status: 'Đang hoạt động', lastReset: Date.now(), x: 650, y: 120, lastAttack: Date.now() };
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
      soloBossState[key] = { hp: zone.boss.hpMax, status: 'Đang hoạt động', x: 650, y: 120, lastAttack: Date.now() };
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

// ====== SAVE/LOAD PLAYER DATA ======
async function savePlayerToDB(playerData) {
  if (!db || !playerData.userId) return;
  try {
    await db.collection('characters').updateOne(
      { userId: playerData.userId },
      { $set: {
        name: playerData.name, class: playerData.class, race: playerData.race,
        level: playerData.level, hp: playerData.hp, hpMax: playerData.hpMax,
        combatRating: playerData.combatRating,
        gold: playerData.gold || 0,
        inventory: playerData.inventory || [],
        bossKills: playerData.bossKills || 0,
        lastSeen: new Date()
      }},
      { upsert: true }
    );
  } catch (e) { console.error('Save error:', e.message); }
}

async function loadPlayerFromDB(userId) {
  if (!db) return null;
  try {
    return await db.collection('characters').findOne({ userId });
  } catch (e) { return null; }
}

// ====== AUTH ROUTES ======
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Tên tài khoản và mật khẩu là bắt buộc' });
  if (username.length < 3) return res.status(400).json({ error: 'Tên tài khoản phải có ít nhất 3 ký tự' });
  if (password.length < 4) return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 4 ký tự' });
  if (!db) return res.status(500).json({ error: 'Database chưa sẵn sàng' });

  try {
    const existing = await db.collection('users').findOne({ username: username.toLowerCase() });
    if (existing) return res.status(409).json({ error: 'Tên tài khoản đã tồn tại' });

    const hashedPw = await bcrypt.hash(password, 10);
    const result = await db.collection('users').insertOne({
      username: username.toLowerCase(),
      password: hashedPw,
      createdAt: new Date()
    });

    // Create initial character
    const charName = NAMES_POOL[randomInt(0, NAMES_POOL.length - 1)] + '_' + randomInt(10, 99);
    await db.collection('characters').insertOne({
      userId: result.insertedId.toString(),
      name: charName,
      class: CLASSES[randomInt(0, CLASSES.length - 1)],
      race: RACES[randomInt(0, RACES.length - 1)],
      level: 1,
      hp: 48000, hpMax: 48000,
      combatRating: randomInt(8000, 15000),
      gold: 0, inventory: [], bossKills: 0,
      createdAt: new Date(), lastSeen: new Date()
    });

    const token = jwt.sign({ userId: result.insertedId.toString(), username: username.toLowerCase() }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username: username.toLowerCase() });
  } catch (e) {
    res.status(500).json({ error: 'Lỗi server: ' + e.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Thiếu thông tin đăng nhập' });
  if (!db) return res.status(500).json({ error: 'Database chưa sẵn sàng' });

  try {
    const user = await db.collection('users').findOne({ username: username.toLowerCase() });
    if (!user) return res.status(401).json({ error: 'Tài khoản không tồn tại' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Sai mật khẩu' });

    const token = jwt.sign({ userId: user._id.toString(), username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username: user.username });
  } catch (e) {
    res.status(500).json({ error: 'Lỗi server: ' + e.message });
  }
});

app.get('/api/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Không có token' });
  try {
    const decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
    res.json({ userId: decoded.userId, username: decoded.username });
  } catch {
    res.status(401).json({ error: 'Token hết hạn hoặc không hợp lệ' });
  }
});

// ====== SOCKET HANDLING ======
io.on('connection', async (socket) => {
  console.log(`[+] Player connected: ${socket.id}`);
  let isAuthenticated = false;

  // ---- AUTH via socket ----
  socket.on('authenticate', async (data) => {
    let userId = null;
    let charData = null;

    if (data.token) {
      try {
        const decoded = jwt.verify(data.token, JWT_SECRET);
        userId = decoded.userId;
        charData = await loadPlayerFromDB(userId);
      } catch { /* invalid token, play as guest */ }
    }

    let playerData;
    if (charData) {
      // Logged-in player with saved data
      playerData = {
        name: charData.name, class: charData.class, race: charData.race,
        level: charData.level, hp: charData.hpMax, hpMax: charData.hpMax,
        combatRating: charData.combatRating,
        gold: charData.gold || 0, inventory: charData.inventory || [],
        bossKills: charData.bossKills || 0,
        userId, currentZone: null, x: 150, y: 300, isDead: false
      };
      isAuthenticated = true;
    } else {
      // Guest player
      const playerName = NAMES_POOL[randomInt(0, NAMES_POOL.length - 1)] + '_' + randomInt(10, 99);
      playerData = {
        name: playerName, class: CLASSES[randomInt(0, CLASSES.length - 1)],
        race: RACES[randomInt(0, RACES.length - 1)], level: 1,
        hp: 48000, hpMax: 48000, combatRating: randomInt(8000, 15000),
        gold: 0, inventory: [], bossKills: 0,
        userId: null, currentZone: null, x: 150, y: 300, isDead: false
      };
    }
    players.set(socket.id, playerData);

    socket.emit('init', {
      player: {
        name: playerData.name, class: playerData.class, race: playerData.race,
        level: playerData.level, hp: playerData.hp, hpMax: playerData.hpMax,
        combatRating: playerData.combatRating,
        gold: playerData.gold, inventory: playerData.inventory,
        bossKills: playerData.bossKills, isLoggedIn: isAuthenticated
      },
      zones: Object.values(ZONES).map(z => ({
        id: z.id, name: z.name, type: z.type,
        boss: { name: z.boss.name, level: z.boss.level, hpMax: z.boss.hpMax, difficulty: z.boss.difficulty }
      })),
      onlineCount: players.size
    });
    io.emit('online_count', players.size);
  });

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
    player.x = 100 + randomInt(0, 200);
    player.y = 250 + randomInt(0, 150);
    socket.join(`zone:${zoneId}`);

    const bossState = getBossState(socket.id, zoneId);

    // If guild boss is dead, respawn it
    if (zone.type === 'guild' && bossState.hp <= 0) {
      resetGuildBoss(zoneId);
    }

    const freshBoss = getBossState(socket.id, zoneId);

    // Build other players list with positions (guild zones only)
    const otherPlayers = [];
    if (zone.type === 'guild') {
      getPlayersInZone(zoneId).forEach(p => {
        if (p.socketId !== socket.id) {
          otherPlayers.push({ name: p.name, class: p.class, level: p.level, x: p.x, y: p.y, hp: p.hp, hpMax: p.hpMax });
        }
      });
    }

    socket.emit('zone_entered', {
      zoneId,
      zone: { id: zone.id, name: zone.name, type: zone.type, boss: zone.boss },
      bossHp: freshBoss.hp,
      bossStatus: freshBoss.status,
      bossX: freshBoss.x,
      bossY: freshBoss.y,
      player: { hp: player.hp, hpMax: player.hpMax, x: player.x, y: player.y },
      playersInZone: zone.type === 'guild' ? getPlayersInZone(zoneId).map(p => p.name) : [player.name],
      otherPlayers
    });

    // Notify others in guild zone
    if (zone.type === 'guild') {
      socket.to(`zone:${zoneId}`).emit('player_joined_zone', {
        name: player.name, class: player.class, level: player.level,
        x: player.x, y: player.y, hp: player.hp, hpMax: player.hpMax,
        zoneId,
        playersInZone: getPlayersInZone(zoneId).map(p => p.name)
      });
    }
  });

  // ---- ATTACK BOSS ----
  socket.on('attack', () => {
    const player = players.get(socket.id);
    if (!player || !player.currentZone || player.isDead) return;

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
            savePlayerToDB(pd);
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

        socket.emit('boss_killed', { killerName: player.name, bossName: zone.boss.name, zoneId, loot, newLevel: player.level });
        // Save loot to player
        player.gold = (player.gold || 0) + loot.gold;
        player.inventory = [...(player.inventory || []), ...loot.items.map(i => ({ name: i.name, rarity: i.rarity, icon: i.icon, type: i.type }))];
        player.bossKills = (player.bossKills || 0) + 1;
        savePlayerToDB(player);
      }
    }

  });

  // ---- PLAYER MOVE ----
  socket.on('player_move', (pos) => {
    const player = players.get(socket.id);
    if (!player || !player.currentZone || player.isDead) return;
    player.x = pos.x;
    player.y = pos.y;
    const zone = ZONES[player.currentZone];
    if (zone && zone.type === 'guild') {
      socket.to(`zone:${player.currentZone}`).emit('player_moved', {
        name: player.name, x: pos.x, y: pos.y
      });
    }
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
  socket.on('disconnect', async () => {
    const player = players.get(socket.id);
    // Save to DB before removing
    if (player) await savePlayerToDB(player);
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

// ====== GAME LOOP (Movement & Attacks) ======
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

// ====== SERVE STATIC BUILD ======
app.use(express.static(path.join(__dirname, 'game-ui', 'dist')));
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'game-ui', 'dist', 'index.html'));
});

// ====== START ======
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎮 AetherWorld Server đang chạy thành công ở cổng ${PORT}!`);
  console.log(`🌍 Nếu chạy trên Render, hãy truy cập link onrender.com của bạn.`);
});
