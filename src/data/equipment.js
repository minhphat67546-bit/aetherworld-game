// ====== LOOT TABLES & EQUIPMENT ======
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
    { name: 'Mảnh Obsidian', rarity: 'common', icon: 'ite', type: 'Nguyên liệu' },
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
  ],
  forest_mob: [
    { name: 'Lá Cây Hắc Ám', rarity: 'common', icon: '🍃', type: 'Nguyên liệu' },
    { name: 'Rìu Rễ Cây Ma', rarity: 'rare', icon: '🪓', type: 'Vũ khí' },
  ],
  volcano_mob: [
    { name: 'Mảnh Obsidian', rarity: 'common', icon: 'ite', type: 'Nguyên liệu' },
    { name: 'Kiếm Nham Thạch', rarity: 'rare', icon: '⚔️', type: 'Vũ khí' },
  ],
  ocean_mob: [
    { name: 'Vảy Kraken', rarity: 'common', icon: '🐚', type: 'Nguyên liệu' },
    { name: 'Đinh Ba Thủy Triều', rarity: 'rare', icon: '🔱', type: 'Vũ khí' },
  ],
  tower_mob: [
    { name: 'Bụi Ma Thuật', rarity: 'common', icon: '✨', type: 'Nguyên liệu' },
    { name: 'Gậy Linh Hồn', rarity: 'rare', icon: '🪄', type: 'Vũ khí' },
  ]
};

const CRAFTING_RECIPES = [
  {
    id: 'sword_of_nature',
    name: 'Kiếm Thiên Nhiên Tối Thượng',
    icon: '🗡️',
    rarity: 'legendary',
    type: 'Vũ khí',
    description: 'Kết hợp sức mạnh của rừng cổ đại, tạo nên thanh kiếm bất bại.',
    ingredients: [
      { name: 'Nhựa Treant Cổ Đại', count: 2 },
      { name: 'Rìu Rễ Cây Ma', count: 1 },
      { name: 'Hạt Giống Thế Giới', count: 1 },
    ],
    result: { name: 'Kiếm Thiên Nhiên Tối Thượng', rarity: 'legendary', icon: '🗡️', type: 'Vũ khí', effect: 'attack_boost', effectValue: 25, equipped: false },
  },
  {
    id: 'flame_greatsword',
    name: 'Đại Kiếm Phượng Hoàng',
    icon: '🔥',
    rarity: 'legendary',
    type: 'Vũ khí',
    description: 'Sức mạnh hỏa diệm cô đọng trong lưỡi kiếm vĩnh cửu.',
    ingredients: [
      { name: 'Mảnh Obsidian', count: 3 },
      { name: 'Lông Phượng Hoàng Lửa', count: 2 },
      { name: 'Kiếm Nham Thạch', count: 1 },
    ],
    result: { name: 'Đại Kiếm Phượng Hoàng', rarity: 'legendary', icon: '🔥', type: 'Vũ khí', effect: 'attack_boost', effectValue: 35, equipped: false },
  },
  {
    id: 'abyssal_trident',
    name: 'Trident Vực Thẳm Tối Cao',
    icon: '🔱',
    rarity: 'legendary',
    type: 'Vũ khí',
    description: 'Quyền năng biển cả tập trung, xé nát mọi kẻ thù.',
    ingredients: [
      { name: 'Vảy Kraken', count: 3 },
      { name: 'Ngọc Trai Vực Thẳm', count: 2 },
      { name: 'Đinh Ba Thủy Triều', count: 1 },
      { name: 'Mắt Kraken', count: 1 },
    ],
    result: { name: 'Trident Vực Thẳm Tối Cao', rarity: 'legendary', icon: '🔱', type: 'Vũ khí', effect: 'attack_boost', effectValue: 40, equipped: false },
  },
  {
    id: 'lich_staff',
    name: 'Trượng Lich Vương Tối Cao',
    icon: '🪄',
    rarity: 'legendary',
    type: 'Vũ khí',
    description: 'Gậy phép chứa đựng linh hồn ngàn năm, sức mạnh vô hạn.',
    ingredients: [
      { name: 'Bụi Ma Thuật', count: 3 },
      { name: 'Sách Phép Cổ', count: 2 },
      { name: 'Gậy Linh Hồn', count: 1 },
      { name: 'Phylactery Vĩnh Cửu', count: 1 },
    ],
    result: { name: 'Trượng Lich Vương Tối Cao', rarity: 'legendary', icon: '🪄', type: 'Vũ khí', effect: 'attack_boost', effectValue: 38, equipped: false },
  },
  {
    id: 'divine_armor',
    name: 'Giáp Thần Thánh',
    icon: '🛡️',
    rarity: 'legendary',
    type: 'Giáp',
    description: 'Kết hợp giáp từ hai miền đất, tạo ra phòng thủ tuyệt đối.',
    ingredients: [
      { name: 'Giáp Vỏ Cây Thiêng', count: 1 },
      { name: 'Giáp Biển Sâu', count: 1 },
      { name: 'Áo Bào Lich Vương', count: 1 },
    ],
    result: { name: 'Giáp Thần Thánh', rarity: 'legendary', icon: '🛡️', type: 'Giáp', effect: 'defense_boost', effectValue: 30, equipped: false },
  },
  {
    id: 'phoenix_cloak',
    name: 'Áo Choàng Phượng Hoàng Bất Tử',
    icon: '🧥',
    rarity: 'legendary',
    type: 'Giáp',
    description: 'Áo choàng lửa thiêng cho phép hồi sinh khi chết.',
    ingredients: [
      { name: 'Áo Choàng Ngọn Lửa', count: 1 },
      { name: 'Cánh Phượng Hoàng Bất Diệt', count: 1 },
      { name: 'Lông Phượng Hoàng Lửa', count: 1 },
    ],
    result: { name: 'Áo Choàng Phượng Hoàng Bất Tử', rarity: 'legendary', icon: '🧥', type: 'Giáp', effect: 'hp_boost', effectValue: 20000, equipped: false },
  },
];

const ITEM_EFFECTS = {
  'Lá Cây Hắc Ám': { type: 'heal', value: 5000, message: 'Hồi phục 5,000 HP từ Lá Cây Hắc Ám!' },
  'Bụi Ma Thuật': { type: 'heal', value: 8000, message: 'Hồi phục 8,000 HP từ Bụi Ma Thuật!' },
  'Mảnh Obsidian': { type: 'temp_attack', value: 10, duration: 60000, message: 'Tăng 10% sát thương trong 60 giây!' },
  'Vảy Kraken': { type: 'temp_defense', value: 15, duration: 60000, message: 'Tăng 15% phòng thủ trong 60 giây!' },
  'Ngọc Trai Vực Thẳm': { type: 'heal', value: 15000, message: 'Hồi phục 15,000 HP từ Ngọc Trai Vực Thẳm!' },
  'Lông Phượng Hoàng Lửa': { type: 'temp_attack', value: 20, duration: 45000, message: 'Sức mạnh phượng hoàng! +20% sát thương trong 45 giây!' },
  'Sách Phép Cổ': { type: 'exp_boost', value: 500, message: 'Học được phép thuật cổ! +500 Combat Rating!' },
  'Nhựa Treant Cổ Đại': { type: 'heal', value: 12000, message: 'Hồi phục 12,000 HP từ Nhựa Treant!' },
  'Thẻ Đổi Tộc': { type: 'race_change', message: 'Đổi chủng tộc thành công!' },
};

const EQUIPMENT_STATS = {
  'Rìu Rễ Cây Ma': { attack: 1500, hpPct: 2 },
  'Giáp Vỏ Cây Thiêng': { defensePct: 15, hpPct: 5, natureResist: 20 },
  'Kiếm Nham Thạch': { attack: 3000, fireResist: 10 },
  'Áo Choàng Ngọn Lửa': { defensePct: 20, hpPct: 8, fireResist: 30 },
  'Vương Miện Kael\'thas': { attackPct: 5, fireResist: 20 },
  'Đinh Ba Thủy Triều': { attack: 4000, waterResist: 15 },
  'Giáp Biển Sâu': { defensePct: 25, hpPct: 10, waterResist: 30 },
  'Mắt Kraken': { attackPct: 10, hpPct: 5 },
  'Gậy Linh Hồn': { attack: 3500, darkResist: 20 },
  'Áo Bào Lich Vương': { defensePct: 18, hpPct: 15, darkResist: 40 },
  
  // Crafted Legendary
  'Kiếm Thiên Nhiên Tối Thượng': { attack: 8000, attackPct: 20, hpPct: 10, natureResist: 50 },
  'Đại Kiếm Phượng Hoàng': { attack: 12000, attackPct: 30, fireResist: 50 },
  'Trident Vực Thẳm Tối Cao': { attack: 15000, attackPct: 35, waterResist: 50 },
  'Trượng Lich Vương Tối Cao': { attack: 14000, attackPct: 40, darkResist: 50 },
  'Giáp Thần Thánh': { defensePct: 50, hpPct: 30, allResist: 30 },
  'Áo Choàng Phượng Hoàng Bất Tử': { defensePct: 40, hpPct: 40, fireResist: 80 },
};

module.exports = {
  RARITY,
  RARITY_COLORS,
  LOOT_TABLES,
  CRAFTING_RECIPES,
  ITEM_EFFECTS,
  EQUIPMENT_STATS
};
