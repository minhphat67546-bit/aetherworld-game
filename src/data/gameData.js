const NAMES_POOL = [
  'DragonSlayer', 'MoonWitch', 'IronFist', 'SilverArrow', 'StormMage',
  'DarkPaladin', 'NightHunter', 'FrostQueen', 'BloodKnight', 'ShadowPriest',
  'ThunderGod', 'PhoenixRider', 'GhostBlade', 'StarDancer', 'WarChief'
];

const CLASSES = ['Tanker', 'Mage', 'Assassin', 'Bruiser', 'All-rounder'];
const RACES = ['Orc', 'Light Elf', 'Dark Elf', 'Dwarf', 'Human'];

const ROLE_STATS = {
  'Orc': { hp: 75000, mp: 15000, attack: 4000, defensePct: 10, basicAttackMulti: 0.5, attackRange: 100 },
  'Light Elf': { hp: 35000, mp: 60000, attack: 7500, defensePct: 3, basicAttackMulti: 0.2, attackRange: 350 },
  'Dark Elf': { hp: 45000, mp: 40000, attack: 6000, defensePct: 4, basicAttackMulti: 0.8, attackRange: 120 },
  'Dwarf': { hp: 60000, mp: 20000, attack: 5000, defensePct: 15, basicAttackMulti: 1.0, attackRange: 130 },
  'Human': { hp: 50000, mp: 25000, attack: 4000, defensePct: 5, basicAttackMulti: 0.6, attackRange: 300 }
};

const SKILLS_DB = {
  'Light Elf': {
    '1': { name: 'Quả cầu Ánh sáng', manaCost: 500, cooldown: 2000, type: 'attack', dmgMulti: 1.2 },
    '2': { name: 'Lưới Điện', manaCost: 1500, cooldown: 8000, type: 'stun', duration: 2000, dmgMulti: 0.5 },
    '3': { name: 'Vòng tròn Lửa', manaCost: 2000, cooldown: 12000, type: 'aoe', dmgMulti: 1.5 },
    '4': { name: 'Khiên Mana', manaCost: 3000, cooldown: 20000, type: 'shield', shieldValue: 15000 },
    'r': { name: 'Ánh Sáng Phán Xét', manaCost: 8000, cooldown: 60000, type: 'ultimate', dmgMulti: 4.0 }
  },
  'Orc': {
    '1': { name: 'Trảm Kích', manaCost: 0, cooldown: 3000, type: 'attack', dmgMulti: 1.5 },
    '2': { name: 'Tiếng Gầm Trận Mạc', manaCost: 1000, cooldown: 15000, type: 'buff_attack', duration: 5000, buffPct: 20 },
    '3': { name: 'Địa Chấn', manaCost: 1500, cooldown: 10000, type: 'slow', duration: 3000, dmgMulti: 0.8 },
    '4': { name: 'Da Sắt', manaCost: 1000, cooldown: 20000, type: 'buff_defense', duration: 4000, buffPct: 100 },
    'r': { name: 'Cuồng Nộ', manaCost: 4000, cooldown: 90000, type: 'ultimate_buff', duration: 6000, atkSpeedBuff: 50 }
  },
  'Human': {
    '1': { name: 'Chém Thường', manaCost: 0, cooldown: 2000, type: 'attack', dmgMulti: 1.0 },
    '2': { name: 'Lưỡi Kiếm', manaCost: 500, cooldown: 5000, type: 'attack', dmgMulti: 1.5 },
    '3': { name: 'Chặn Đòn', manaCost: 800, cooldown: 10000, type: 'shield', shieldValue: 5000 },
    '4': { name: 'Hồi Máu Nhanh', manaCost: 1500, cooldown: 20000, type: 'heal', healValue: 10000 },
    'r': { name: 'Sức Mạnh Con Người', manaCost: 3000, cooldown: 60000, type: 'ultimate', dmgMulti: 3.0 }
  },
  'Dark Elf': {
    '1': { name: 'Phi Tiêu', manaCost: 200, cooldown: 1500, type: 'attack', dmgMulti: 1.1 },
    '2': { name: 'Tàng Hình', manaCost: 1000, cooldown: 15000, type: 'invis', duration: 3000 },
    '3': { name: 'Đâm Lén', manaCost: 1500, cooldown: 8000, type: 'attack', dmgMulti: 2.5 },
    '4': { name: 'Bước Nhảy Bóng Đêm', manaCost: 800, cooldown: 12000, type: 'dash', dmgMulti: 0 },
    'r': { name: 'Vũ Điệu Tử Thần', manaCost: 3500, cooldown: 50000, type: 'ultimate', dmgMulti: 3.5 }
  },
  'Dwarf': {
    '1': { name: 'Búa Đập', manaCost: 300, cooldown: 2500, type: 'attack', dmgMulti: 1.3 },
    '2': { name: 'Cứng Cáp', manaCost: 800, cooldown: 15000, type: 'buff_defense', duration: 5000, buffPct: 50 },
    '3': { name: 'Ném Rìu', manaCost: 600, cooldown: 6000, type: 'attack', dmgMulti: 1.2 },
    '4': { name: 'Say Rượu', manaCost: 1000, cooldown: 20000, type: 'heal', healValue: 15000 },
    'r': { name: 'Cơn Thịnh Nộ Của Thợ Rèn', manaCost: 4000, cooldown: 70000, type: 'ultimate', dmgMulti: 3.0 }
  }
};

const ZONES = {
  safezone: { id: 'safezone', name: 'Thành Cổ Aether', type: 'city', boss: null, mobs: [] },
  forest: { 
    id: 'forest', name: 'Rừng Bóng Tối', type: 'solo', 
    boss: { name: 'Treant Hắc Ám', level: 50, hpMax: 500000, difficulty: 'Hard', attackDmgMin: 500, attackDmgMax: 2500 },
    mobs: [
      { id: 'slime', name: 'Slime Rừng', level: 5, hpMax: 15000, attack: 300, dropTable: 'forest_mob', xp: 150 },
      { id: 'wolf', name: 'Sói Hắc Ám', level: 8, hpMax: 22000, attack: 600, dropTable: 'forest_mob', xp: 250 }
    ]
  },
  volcano: { 
    id: 'volcano', name: 'Vùng Núi Lửa Kael', type: 'guild', 
    boss: { name: "Kael'thas Kẻ Gọi Lửa", level: 90, hpMax: 5000000, difficulty: 'Nightmare', attackDmgMin: 2000, attackDmgMax: 4000 },
    mobs: [
      { id: 'fire_elemental', name: 'Tinh Linh Lửa', level: 40, hpMax: 120000, attack: 1500, dropTable: 'volcano_mob', xp: 1200 },
      { id: 'lava_golem', name: 'Golem Nham Thạch', level: 50, hpMax: 250000, attack: 2500, dropTable: 'volcano_mob', xp: 2000 }
    ]
  },
  ocean: { 
    id: 'ocean', name: 'Đại Dương Vực Thẳm', type: 'guild', 
    boss: { name: 'Kraken Bóng Đêm', level: 95, hpMax: 8000000, difficulty: 'Mythic', attackDmgMin: 3000, attackDmgMax: 5000 },
    mobs: [
      { id: 'murloc', name: 'Người Cá Murloc', level: 55, hpMax: 200000, attack: 2800, dropTable: 'ocean_mob', xp: 1800 },
      { id: 'siren', name: 'Mỹ Nhân Ngư', level: 60, hpMax: 180000, attack: 3500, dropTable: 'ocean_mob', xp: 2200 }
    ]
  },
  tower: { 
    id: 'tower', name: 'Tháp Phù Thủy', type: 'solo', 
    boss: { name: 'Lich Vĩnh Cửu', level: 70, hpMax: 1200000, difficulty: 'Hard', attackDmgMin: 800, attackDmgMax: 3000 },
    mobs: [
      { id: 'skeleton', name: 'Chiến Binh Xương', level: 30, hpMax: 80000, attack: 1200, dropTable: 'tower_mob', xp: 800 },
      { id: 'gargoyle', name: 'Thú Đá Gargoyle', level: 35, hpMax: 150000, attack: 1800, dropTable: 'tower_mob', xp: 1100 }
    ]
  },
  pvp_arena: { id: 'pvp_arena', name: 'Đấu Trường Huyết Mạch', type: 'pvp', boss: null, mobs: [] }
};

module.exports = { NAMES_POOL, CLASSES, RACES, ZONES, ROLE_STATS, SKILLS_DB };
