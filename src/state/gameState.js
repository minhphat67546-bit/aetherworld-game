const { ZONES } = require('../data/gameData');

const players = new Map();
const guildBossState = {};
const soloBossState = {};
const parties = new Map();
const counters = { partyId: 1, tradeId: 1 };
const activeTrades = new Map();

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

module.exports = {
  players,
  guildBossState,
  soloBossState,
  parties,
  counters,
  activeTrades,
  resetGuildBoss,
  getBossState,
  getPlayersInZone
};
