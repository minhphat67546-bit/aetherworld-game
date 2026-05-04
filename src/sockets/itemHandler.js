const { players, getBossState, resetGuildBoss, getPlayersInZone } = require('../state/gameState');
const { getPlayerStats, randomInt } = require('../services/gameService');
const { CRAFTING_RECIPES, ITEM_EFFECTS, EQUIPMENT_STATS, LOOT_TABLES } = require('../data/equipment');
const { ZONES, RACES } = require('../data/gameData');

function registerItemHandlers(io, socket, savePlayerToDB) {
  // ---- USE ITEM ----
  socket.on('use_item', (data) => {
    const player = players.get(socket.id);
    if (!player) return;

    const { itemName } = data;
    const itemIndex = (player.inventory || []).findIndex(i => i.name === itemName);
    if (itemIndex === -1) {
      socket.emit('item_use_result', { success: false, message: 'Không tìm thấy vật phẩm trong túi đồ!' });
      return;
    }

    const item = player.inventory[itemIndex];
    let itemType = item.type;
    if (!itemType) {
      Object.values(LOOT_TABLES).forEach(table => {
        const t = table.find(i => i.name === itemName);
        if (t) itemType = t.type;
      });
      if (!itemType) {
        const recipe = CRAFTING_RECIPES.find(r => r.result.name === itemName);
        if (recipe) itemType = recipe.result.type;
      }
    }

    if (['Vũ khí', 'Giáp', 'Mũ', 'Phụ kiện'].includes(itemType)) {
      if (!player.equipment) player.equipment = {};
      const slotMap = { 'Vũ khí': 'weapon', 'Giáp': 'armor', 'Mũ': 'helmet', 'Phụ kiện': 'accessory' };
      const slot = slotMap[itemType];
      
      if (player.equipment[slot]) {
        player.inventory.push(player.equipment[slot]);
      }
      
      item.type = itemType;
      player.equipment[slot] = item;
      player.inventory.splice(itemIndex, 1);
      
      player.isDirty = true;
      const stats = getPlayerStats(player);
      socket.emit('item_use_result', {
        success: true,
        message: `Đã trang bị ${item.name}!`,
        player: {
          hp: Math.min(player.hp, stats.hpMax), hpMax: stats.hpMax,
          combatRating: player.combatRating,
          race: player.race,
          inventory: player.inventory,
          equipment: player.equipment,
          gold: player.gold,
          calculatedStats: stats
        }
      });
      return;
    }

    const effect = ITEM_EFFECTS[itemName];
    if (!effect) {
      socket.emit('item_use_result', { success: false, message: 'Vật phẩm này không thể sử dụng trực tiếp!' });
      return;
    }

    // Remove item from inventory
    player.inventory.splice(itemIndex, 1);

    // Apply effect
    let resultMessage = effect.message;
    switch (effect.type) {
      case 'heal':
        player.hp = Math.min(player.hpMax, player.hp + effect.value);
        break;
      case 'temp_attack':
        player.tempAttackBoost = (player.tempAttackBoost || 0) + effect.value;
        setTimeout(() => {
          if (players.has(socket.id)) {
            const p = players.get(socket.id);
            p.tempAttackBoost = Math.max(0, (p.tempAttackBoost || 0) - effect.value);
            socket.emit('buff_expired', { type: 'attack', message: 'Hiệu ứng tăng sát thương đã hết!' });
          }
        }, effect.duration);
        break;
      case 'temp_defense':
        player.tempDefenseBoost = (player.tempDefenseBoost || 0) + effect.value;
        setTimeout(() => {
          if (players.has(socket.id)) {
            const p = players.get(socket.id);
            p.tempDefenseBoost = Math.max(0, (p.tempDefenseBoost || 0) - effect.value);
            socket.emit('buff_expired', { type: 'defense', message: 'Hiệu ứng tăng phòng thủ đã hết!' });
          }
        }, effect.duration);
        break;
      case 'exp_boost':
        player.combatRating = (player.combatRating || 0) + effect.value;
        break;
      case 'race_change':
        player.race = RACES[randomInt(0, RACES.length - 1)];
        resultMessage = `Đổi chủng tộc thành ${player.race} thành công!`;
        break;
    }

    player.isDirty = true;
    socket.emit('item_use_result', {
      success: true,
      message: resultMessage,
      effectType: effect.type,
      player: {
        hp: player.hp, hpMax: player.hpMax,
        combatRating: player.combatRating,
        race: player.race,
        inventory: player.inventory,
        equipment: player.equipment || {},
        gold: player.gold,
        tempAttackBoost: player.tempAttackBoost || 0,
        tempDefenseBoost: player.tempDefenseBoost || 0,
      }
    });
  });

  // ---- UNEQUIP ITEM ----
  socket.on('unequip_item', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.equipment) return;
    const slot = data.slot;
    const item = player.equipment[slot];
    if (!item) return;

    if ((player.inventory || []).length >= 24) {
      socket.emit('item_use_result', { success: false, message: 'Túi đồ đã đầy, không thể tháo trang bị!' });
      return;
    }

    delete player.equipment[slot];
    player.inventory.push(item);
    
    player.isDirty = true;
    const stats = getPlayerStats(player);
    socket.emit('item_use_result', {
      success: true,
      message: `Đã tháo ${item.name}!`,
      player: {
        hp: Math.min(player.hp, stats.hpMax), hpMax: stats.hpMax,
        combatRating: player.combatRating,
        race: player.race,
        inventory: player.inventory,
        equipment: player.equipment,
        gold: player.gold,
        calculatedStats: stats
      }
    });
  });

  // ---- CRAFT ITEM ----
  socket.on('craft_item', (data) => {
    const player = players.get(socket.id);
    if (!player) return;

    const { recipeId } = data;
    const recipe = CRAFTING_RECIPES.find(r => r.id === recipeId);
    if (!recipe) {
      socket.emit('craft_result', { success: false, message: 'Công thức không tồn tại!' });
      return;
    }

    // Check ingredients
    const inv = player.inventory || [];
    for (const ingredient of recipe.ingredients) {
      const count = inv.filter(i => i.name === ingredient.name).length;
      if (count < ingredient.count) {
        socket.emit('craft_result', {
          success: false,
          message: `Thiếu nguyên liệu: ${ingredient.name} (cần ${ingredient.count}, có ${count})`,
        });
        return;
      }
    }

    // Remove ingredients from inventory
    const newInv = [...inv];
    for (const ingredient of recipe.ingredients) {
      let toRemove = ingredient.count;
      for (let i = newInv.length - 1; i >= 0 && toRemove > 0; i--) {
        if (newInv[i].name === ingredient.name) {
          newInv.splice(i, 1);
          toRemove--;
        }
      }
    }

    // Add crafted item
    const craftedItem = { ...recipe.result, id: Date.now() + '_crafted', craftedAt: new Date().toISOString() };
    newInv.push(craftedItem);
    player.inventory = newInv;

    player.isDirty = true;
    savePlayerToDB(player).catch(console.error);
    socket.emit('craft_result', {
      success: true,
      message: `🎉 Chế tạo thành công: ${recipe.name}!`,
      craftedItem,
      inventory: player.inventory,
    });
  });

  // ---- GET INVENTORY ----
  socket.on('get_inventory', () => {
    const player = players.get(socket.id);
    if (!player) return;
    const stats = getPlayerStats(player);
    socket.emit('inventory_data', {
      inventory: player.inventory || [],
      equipment: player.equipment || {},
      gold: player.gold || 0,
      calculatedStats: stats,
      recipes: CRAFTING_RECIPES.map(r => ({
        id: r.id, name: r.name, icon: r.icon, rarity: r.rarity,
        type: r.type, description: r.description,
        ingredients: r.ingredients,
        result: r.result,
      })),
    });
  });

}

module.exports = registerItemHandlers;
