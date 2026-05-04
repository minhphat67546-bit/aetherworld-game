// ====== GAME CONSTANTS & ZONES ======
const NAMES_POOL = [
  'DragonSlayer', 'MoonWitch', 'IronFist', 'SilverArrow', 'StormMage',
  'DarkPaladin', 'NightHunter', 'FrostQueen', 'BloodKnight', 'ShadowPriest',
  'ThunderGod', 'PhoenixRider', 'GhostBlade', 'StarDancer', 'WarChief'
];

const CLASSES = ['Warrior', 'Mage', 'Rogue', 'Paladin', 'Hunter', 'Priest', 'Necromancer', 'Druid'];
const RACES = ['Human', 'Elf', 'Dwarf', 'Orc', 'Undead', 'Dragon-kin', 'Fae'];

const ZONES = {
  safezone: {
    id: 'safezone', name: 'Làng Khởi Nguyên', type: 'safe',
    boss: null // No boss in safe zone
  },
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
  },
  pvp_arena: {
    id: 'pvp_arena', name: 'Đấu Trường Huyết Mạch', type: 'pvp',
    boss: null
  }
};

module.exports = {
  NAMES_POOL,
  CLASSES,
  RACES,
  ZONES
};
