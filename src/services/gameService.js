const { RARITY, RARITY_COLORS, LOOT_TABLES, EQUIPMENT_STATS } = require('../data/equipment');

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getPlayerStats(player) {
  // Base stats based on level
  const baseHp = 48000 + (player.level * 2000);
  const baseAttack = 5000 + (player.level * 200);
  
  let stats = {
    hpMax: baseHp,
    attack: baseAttack,
    attackPct: 0,
    defensePct: 0,
    hpPct: 0,
    fireResist: 0,
    waterResist: 0,
    natureResist: 0,
    darkResist: 0,
    allResist: 0
  };

  // Add equipment bonuses
  if (player.equipment) {
    Object.values(player.equipment).forEach(item => {
      const eqStats = EQUIPMENT_STATS[item.name];
      if (eqStats) {
        if (eqStats.attack) stats.attack += eqStats.attack;
        if (eqStats.attackPct) stats.attackPct += eqStats.attackPct;
        if (eqStats.defensePct) stats.defensePct += eqStats.defensePct;
        if (eqStats.hpPct) stats.hpPct += eqStats.hpPct;
        if (eqStats.fireResist) stats.fireResist += eqStats.fireResist;
        if (eqStats.waterResist) stats.waterResist += eqStats.waterResist;
        if (eqStats.natureResist) stats.natureResist += eqStats.natureResist;
        if (eqStats.darkResist) stats.darkResist += eqStats.darkResist;
        if (eqStats.allResist) stats.allResist += eqStats.allResist;
      }
    });
  }
  
  // Calculate final
  stats.hpMax = Math.floor(stats.hpMax * (1 + stats.hpPct / 100));
  stats.attack = Math.floor(stats.attack * (1 + stats.attackPct / 100));
  
  // Add temporary buffs
  if (player.tempAttackBoost) stats.attack = Math.floor(stats.attack * (1 + player.tempAttackBoost / 100));
  if (player.tempDefenseBoost) stats.defensePct += player.tempDefenseBoost;
  
  // Update combat rating based on stats
  const combatRating = Math.floor(stats.attack + stats.hpMax * 0.1 + stats.defensePct * 100 + (stats.fireResist+stats.waterResist+stats.natureResist+stats.darkResist+stats.allResist*4)*50);
  player.combatRating = combatRating;

  return stats;
}

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

module.exports = { randomInt, getPlayerStats, generateLoot };
