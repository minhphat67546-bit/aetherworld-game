const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MongoClient, ObjectId } = require('mongodb');
const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

const { players, soloBossState, parties, counters, activeTrades, resetGuildBoss, getBossState, getPlayersInZone } = require('./src/state/gameState');
const { getPlayerStats, generateLoot, randomInt } = require('./src/services/gameService');
const { startGameLoop } = require('./src/game/gameLoop');
const registerCombatHandlers = require('./src/sockets/combatHandler');
const registerTradeHandlers = require('./src/sockets/tradeHandler');
const registerPartyHandlers = require('./src/sockets/partyHandler');
const registerItemHandlers = require('./src/sockets/itemHandler');
const registerNpcHandlers = require('./src/sockets/npcHandler');
const app = express();
app.use(cors());
app.use(express.json());

const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

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
    
    // Create indexes
    await db.collection('users').createIndex({ username: 1 }, { unique: true });
    
    // ====== TỐI ƯU HÓA NHÂN VẬT (CHARACTERS) ======
    await db.collection('characters').createIndex({ userId: 1 }, { unique: true });
    await db.collection('characters').createIndex({ name: 1 });
    await db.collection('characters').createIndex({ level: -1, combatRating: -1 });

    // 4. Schema Validation với additionalProperties: false
    // Định nghĩa Schema cho một Vật phẩm (Item) trong game
    const itemSchema = {
      bsonType: "object",
      required: ["name"], // Mọi vật phẩm ít nhất phải có tên
      properties: {
        id: { bsonType: ["string", "int", "double", "long"] },
        name: { bsonType: "string" },
        rarity: { bsonType: "string" },
        icon: { bsonType: "string" },
        type: { bsonType: "string" },
        rarityLabel: { bsonType: "string" },
        color: { bsonType: "string" },
        craftedAt: { bsonType: "string" },
        // Dự phòng các chỉ số phụ của trang bị nếu có
        attack: { bsonType: ["int", "double", "long"] },
        attackPct: { bsonType: ["int", "double", "long"] },
        defensePct: { bsonType: ["int", "double", "long"] },
        hpPct: { bsonType: ["int", "double", "long"] },
        fireResist: { bsonType: ["int", "double", "long"] },
        waterResist: { bsonType: ["int", "double", "long"] },
        natureResist: { bsonType: ["int", "double", "long"] },
        darkResist: { bsonType: ["int", "double", "long"] },
        allResist: { bsonType: ["int", "double", "long"] },
        description: { bsonType: "string" }
      },
      additionalProperties: true // Cho phép linh hoạt các thuộc tính phụ của item để không break game
    };

    const characterSchema = {
      $jsonSchema: {
         bsonType: "object",
         required: ["userId", "name", "class", "race", "level", "hp", "hpMax"],
         properties: {
            _id: { bsonType: "objectId" },
            userId: { bsonType: "string" },
            name: { bsonType: "string", maxLength: 30 },
            class: { 
              bsonType: "string",
              enum: ['Warrior', 'Mage', 'Rogue', 'Paladin', 'Hunter', 'Priest', 'Necromancer', 'Druid']
            },
            race: { bsonType: "string" },
            level: { bsonType: ["int", "double", "long"], minimum: 1 },
            hp: { bsonType: ["int", "double", "long"] },
            hpMax: { bsonType: ["int", "double", "long"] },
            gold: { bsonType: ["int", "double", "long"] },
            combatRating: { bsonType: ["int", "double", "long"] },
            bossKills: { bsonType: ["int", "double", "long"] },
            lastSeen: { bsonType: "date" },
            
            // TÚI ĐỒ: Là một mảng chứa các object Item
            inventory: {
               bsonType: "array",
               items: itemSchema
            },
            
            // TRANG BỊ: Là một object chứa các slot (vũ khí, giáp...)
            equipment: {
               bsonType: "object",
               properties: {
                  weapon: itemSchema,
                  armor: itemSchema,
                  helmet: itemSchema,
                  accessory: itemSchema
               },
               additionalProperties: false // Chỉ cho phép 4 slot này trên nhân vật
            }
         },
         // CHÌA KHÓA TỐI ƯU: Không cho phép thêm bất kỳ trường rác nào ngoài các thuộc tính ở trên vào tài khoản người chơi
         additionalProperties: false 
      }
    };
    
    try {
      await db.command({ collMod: "characters", validator: characterSchema, validationLevel: "moderate" });
    } catch (e) {
      if (e.codeName === 'NamespaceNotFound') {
        await db.createCollection("characters", { validator: characterSchema });
      }
    }
  } catch (err) {
    console.warn('⚠️ MongoDB error:', err.message);
  }
}
connectDB();

// ====== GAME STATE & DATA ======
const { NAMES_POOL, CLASSES, RACES, ZONES } = require('./src/data/gameData');

// ====== LOOT TABLES & EQUIPMENT ======
const { RARITY, RARITY_COLORS, LOOT_TABLES, CRAFTING_RECIPES, ITEM_EFFECTS, EQUIPMENT_STATS } = require('./src/data/equipment');


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
        equipment: playerData.equipment || {},
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
const authRoutes = require('./src/routes/auth')(() => db, JWT_SECRET, NAMES_POOL, CLASSES, RACES, randomInt);
app.use('/api', authRoutes);

// ====== SOCKET HANDLING ======
io.on('connection', async (socket) => {
  console.log(`[+] Player connected: ${socket.id}`);
  let isAuthenticated = false;
  registerCombatHandlers(io, socket);
  registerTradeHandlers(io, socket, savePlayerToDB);
  registerPartyHandlers(io, socket);
  registerItemHandlers(io, socket, savePlayerToDB);
  registerNpcHandlers(io, socket, ai);

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
        equipment: charData.equipment || {},
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
        gold: 0, inventory: [], equipment: {}, bossKills: 0,
        userId: null, currentZone: null, x: 150, y: 300, isDead: false
      };
    }
    players.set(socket.id, playerData);

    const stats = getPlayerStats(playerData);
    playerData.hpMax = stats.hpMax;
    playerData.hp = Math.min(playerData.hp, stats.hpMax);

    socket.emit('init', {
      player: {
        name: playerData.name, class: playerData.class, race: playerData.race,
        level: playerData.level, hp: playerData.hp, hpMax: playerData.hpMax,
        combatRating: playerData.combatRating,
        gold: playerData.gold, inventory: playerData.inventory,
        equipment: playerData.equipment,
        bossKills: playerData.bossKills, isLoggedIn: isAuthenticated,
        calculatedStats: stats
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


  // ---- PLAYER MOVE ----
  socket.on('player_move', (pos) => {
    const player = players.get(socket.id);
    if (!player || !player.currentZone || player.isDead) return;
    
    // 1. Kiểm tra dữ liệu đầu vào (Basic validation)
    if (typeof pos.x !== 'number' || typeof pos.y !== 'number' || isNaN(pos.x) || isNaN(pos.y)) {
      return;
    }

    const now = Date.now();
    if (!player.lastMoveTime) player.lastMoveTime = now;
    
    // 2. Chống Teleport / Speed Hack
    const MAX_SPEED_PX_PER_SEC = 300; // Tốc độ di chuyển tối đa cho phép
    const dt = (now - player.lastMoveTime) / 1000; // Đổi sang giây
    
    if (dt > 0) {
      const dx = pos.x - player.x;
      const dy = pos.y - player.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Tính quãng đường tối đa có thể đi được trong khoảng thời gian dt (cộng thêm 150px sai số do lag/ping)
      const maxAllowedDist = (MAX_SPEED_PX_PER_SEC * dt) + 150;
      
      if (distance > maxAllowedDist) {
         // Nếu di chuyển xa hơn mức cho phép -> Phát hiện nghi vấn Hack
         // Gửi lệnh ép client giật ngược lại vị trí hợp lệ cuối cùng trên server
         socket.emit('force_move', { x: player.x, y: player.y });
         socket.emit('sys_msg', { msg: 'Hệ thống: Phát hiện tốc độ di chuyển bất thường!' });
         return; // Chặn cập nhật vị trí mới
      }
    }

    // 3. Cập nhật vị trí hợp lệ
    player.x = pos.x;
    player.y = pos.y;
    player.lastMoveTime = now;

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


// ====== BACKGROUND SAVE LOOP ======
setInterval(() => {
  let savedCount = 0;
  players.forEach(p => {
    if (p.isDirty) {
      savePlayerToDB(p).catch(console.error);
      p.isDirty = false;
      savedCount++;
    }
  });
  if (savedCount > 0) console.log(`[DB] Auto-saved ${savedCount} dirty players.`);
}, 30000); // Save every 30 seconds


// ====== SERVE STATIC BUILD ======
// Serve game assets (boss images, zone backgrounds, etc.)
app.use('/assets', express.static(path.join(__dirname, 'game-ui', 'public', 'assets')));
// Serve the new RPG layout UI
app.use(express.static(path.join(__dirname, 'game-ui', 'rpg-layout')));
// Fallback: serve Vite build if it exists
app.use(express.static(path.join(__dirname, 'game-ui', 'dist')));
app.get('/{*splat}', (req, res) => {
  // Try rpg-layout first, then fall back to dist
  const rpgIndex = path.join(__dirname, 'game-ui', 'rpg-layout', 'index.html');
  const distIndex = path.join(__dirname, 'game-ui', 'dist', 'index.html');
  const fs = require('fs');
  if (fs.existsSync(rpgIndex)) res.sendFile(rpgIndex);
  else res.sendFile(distIndex);
});

// ====== START ======
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎮 AetherWorld Server đang chạy thành công ở cổng ${PORT}!`);
  console.log(`🌍 Nếu chạy trên Render, hãy truy cập link onrender.com của bạn.`);
});
