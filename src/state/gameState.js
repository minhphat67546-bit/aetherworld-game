const { ZONES } = require('../data/gameData');

const players = new Map();
const guildBossState = {};
const soloBossState = {};
const parties = new Map();
const counters = { partyId: 1, tradeId: 1 };
const activeTrades = new Map();
const roomMobs = {};

function initRoomMobs(roomName, zoneId) {
  if (roomMobs[roomName]) return; // already initialized
  const zone = ZONES[zoneId];
  if (!zone || !zone.mobs || zone.mobs.length === 0) return;
  
  roomMobs[roomName] = [];
  // spawn 4-6 random mobs
  const count = Math.floor(Math.random() * 3) + 4;
  for(let i=0; i<count; i++) {
    const template = zone.mobs[Math.floor(Math.random() * zone.mobs.length)];
    roomMobs[roomName].push({
      id: `mob_${Date.now()}_${i}`,
      templateId: template.id,
      name: template.name,
      level: template.level,
      hp: template.hpMax,
      hpMax: template.hpMax,
      attack: template.attack,
      dropTable: template.dropTable,
      xp: template.xp,
      x: 100 + Math.random() * 500,
      y: 100 + Math.random() * 300,
      drawOffsetX: 0,
      drawOffsetY: -20,
      isDead: false,
      lastAttack: Date.now()
    });
  }
}

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
    const player = players.get(socketId);
    const idKey = (player && player.partyId) ? player.partyId : socketId;
    const key = `${idKey}:${zoneId}`;
    if (!soloBossState[key]) {
      soloBossState[key] = zone.boss ? { hp: zone.boss.hpMax, status: 'Đang hoạt động', x: 650, y: 120, lastAttack: Date.now() } : { hp: 0, status: 'Không có Boss' };
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

module.exports = {
  players,
  guildBossState,
  soloBossState,
  parties,
  counters,
  activeTrades,
  roomMobs,
  resetGuildBoss,
  initRoomMobs,
  getBossState,
  getPlayersInZone
};
