/**
 * AetherWorld RPG — Main App (Socket.io + UI logic)
 */
(function() {
  'use strict';

  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
  const SERVER = isLocal ? 'http://localhost:3000' : window.location.origin;
  const socket = io(SERVER, { transports:['websocket','polling'], autoConnect:false });

  // State
  let state = {
    view:'auth', authMode:'login', character:null, zones:[], connected:false,
    isLoggedIn:false, activeZone:null, bossHp:0, bossHpMax:1, combatLogs:[],
    otherPlayers:{}, isDead:false, deathTimer:0, lootDrop:null, currentPanel:null,
    npcChatHistory: [], mobs: []
  };

  // DOM refs
  const $ = id => document.getElementById(id);
  const authScreen = $('auth-screen'), loadingScreen = $('loading-screen'), gameShell = $('game-shell');
  const authForm = $('auth-form'), authError = $('auth-error');

  // ====== VIEW SWITCHING ======
  function showView(v) {
    state.view = v;
    authScreen.style.display = v==='auth' ? 'flex' : 'none';
    loadingScreen.style.display = v==='loading' ? 'flex' : 'none';
    gameShell.style.display = v==='game' ? 'grid' : 'none';
    if (v==='game') {
      GameEngine.resizeCanvas();
      $('controls-hint').style.display = 'block';
    }
  }

  // ====== AUTH ======
  authForm.addEventListener('submit', async e => {
    e.preventDefault();
    authError.textContent = '';
    const user = $('auth-username').value.trim(), pass = $('auth-password').value;
    if (!user || !pass) { authError.textContent = 'Vui lòng nhập đầy đủ'; return; }
    try {
      const endpoint = state.authMode === 'register' ? '/api/register' : '/api/login';
      const res = await fetch(SERVER + endpoint, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ username:user, password:pass })
      });
      const data = await res.json();
      if (!res.ok) { authError.textContent = data.error; return; }
      localStorage.setItem('aether_token', data.token);
      localStorage.setItem('aether_user', data.username);
      state.isLoggedIn = true;
      showView('loading');
      socket.disconnect(); socket.connect();
    } catch(err) { authError.textContent = 'Không thể kết nối server'; }
  });

  $('auth-toggle-btn').addEventListener('click', () => {
    state.authMode = state.authMode === 'login' ? 'register' : 'login';
    $('auth-btn-text').textContent = state.authMode === 'login' ? 'ĐĂNG NHẬP' : 'ĐĂNG KÝ';
    $('auth-subtitle').textContent = state.authMode === 'login' ? 'Đăng nhập để lưu tiến trình' : 'Tạo tài khoản mới';
    $('auth-toggle-btn').textContent = state.authMode === 'login' ? 'Chưa có tài khoản? Đăng ký ngay' : 'Đã có tài khoản? Đăng nhập';
    authError.textContent = '';
  });

  $('guest-btn').addEventListener('click', () => {
    localStorage.removeItem('aether_token'); localStorage.removeItem('aether_user');
    showView('loading'); socket.disconnect(); socket.connect();
  });

  $('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('aether_token'); localStorage.removeItem('aether_user');
    state.isLoggedIn = false; state.character = null;
    socket.disconnect(); socket.connect();
    showView('auth');
  });

  // ====== SOCKET EVENTS ======
  socket.on('connect', () => {
    state.connected = true;
    $('status-dot').classList.add('status-dot--online');
    socket.emit('authenticate', { token: localStorage.getItem('aether_token') });
  });
  socket.on('disconnect', () => {
    state.connected = false;
    $('status-dot').classList.remove('status-dot--online');
  });

  socket.on('init', data => {
    state.character = data.player; state.zones = data.zones;
    state.skills = data.skills;
    updatePlayerUI();
    buildInventoryGrid();
    $('online-count').textContent = data.onlineCount + ' Online';
    const hasToken = localStorage.getItem('aether_token');
    if (state.view === 'loading' || (state.view === 'auth' && hasToken && data.player.isLoggedIn)) {
      showView('game');
    }
    GameEngine.setPlayerInfo(data.player.name, data.player.hp, data.player.hpMax);
    // Sync race-based GIF model
    if (data.player.race && GameEngine.setPlayerRace) {
      GameEngine.setPlayerRace(data.player.race);
    }
    updateAvatarSprite(data.player.race);
  });

  socket.on('online_count', c => $('online-count').textContent = c + ' Online');

  // Zone entered
  socket.on('zone_entered', data => {
    state.activeZone = data.zone; state.bossHp = data.bossHp; state.bossHpMax = data.zone.boss ? data.zone.boss.hpMax : 1;
    state.combatLogs = [{ text:`Bạn đã tiến vào ${data.zone.name}`, type:'system' }];
    state.character.hp = data.player.hp; state.character.hpMax = data.player.hpMax;

    // Build other players
    state.otherPlayers = {};
    (data.otherPlayers||[]).forEach(p => { state.otherPlayers[p.name] = p; });

    GameEngine.setZone(data.zoneId);
    GameEngine.setPlayerPos(data.player.x||150, data.player.y||300);
    if (data.zone.boss) GameEngine.setBoss(data.bossX||650, data.bossY||120, data.bossHp, data.zone.boss.hpMax);
    
    state.mobs = data.mobs || [];
    GameEngine.setMobs(state.mobs);
    
    GameEngine.setOtherPlayers(state.otherPlayers);
    GameEngine.setPlayerInfo(state.character.name, state.character.hp, state.character.hpMax);

    updatePlayerUI(); updateBossUI(); updateCombatLog();
    $('zone-title').textContent = data.zone.name;
    $('exit-zone-btn').style.display = 'block';
    $('boss-hud').style.display = 'block';
    $('combat-log-container').style.display = 'block';
    $('skill-bar-hud').style.display = 'flex';
    $('controls-hint').style.display = 'block';
    closeOverlayPanel();
  });

  socket.on('player_joined_zone', data => {
    state.otherPlayers[data.name] = { name:data.name, x:data.x, y:data.y, hp:data.hp, hpMax:data.hpMax };
    GameEngine.setOtherPlayers(state.otherPlayers);
    addLog(`⚔️ ${data.name} đã tham gia!`, 'guild');
  });
  socket.on('player_left_zone', data => {
    delete state.otherPlayers[data.name];
    GameEngine.setOtherPlayers(state.otherPlayers);
    addLog(`👋 ${data.name} đã rời.`, 'system');
  });
  socket.on('player_moved', data => {
    if (state.otherPlayers[data.name]) {
      state.otherPlayers[data.name].x = data.x;
      state.otherPlayers[data.name].y = data.y;
      GameEngine.setOtherPlayers(state.otherPlayers);
    }
  });

  socket.on('mobs_moved', data => {
    // data is array of {id, x, y}
    data.forEach(dm => {
        const m = state.mobs.find(mob => mob.id === dm.id);
        if (m) { m.x = dm.x; m.y = dm.y; }
    });
    GameEngine.setMobs(state.mobs);
  });

  socket.on('mob_attack', data => {
      // data: mobId, targetName, damage, targetHp
      if (data.targetName === state.character.name) {
          state.character.hp = data.targetHp;
          GameEngine.setPlayerInfo(state.character.name, state.character.hp, state.character.hpMax);
          updatePlayerUI();
          GameEngine.createDamageText(data.damage, GameEngine.getPlayer().x, GameEngine.getPlayer().y - 40, false, true);
      }
      addLog(`💥 Mob đánh ${data.targetName} mất ${data.damage} HP!`, 'boss');
  });

  socket.on('mob_attack_result', data => {
      const { attackerName, mobId, damage, isCrit, mobHp } = data;
      const mob = state.mobs.find(m => m.id === mobId);
      if (mob) {
          mob.hp = mobHp;
          GameEngine.setMobs(state.mobs);
          // Queue damage at impact frame
          GameEngine.queueDamage(damage, mob.x, mob.y - 30, isCrit, false, null, null);
      }
      addLog(`🗡️ ${attackerName} chém Mob mất ${damage} HP${isCrit ? ' (CRIT!)' : ''}`, 'dmg');
  });

  socket.on('mob_killed', data => {
      const { mobId, mobName, loot, newLevel } = data;
      state.mobs = state.mobs.filter(m => m.id !== mobId);
      GameEngine.setMobs(state.mobs);
      addLog(`🎉 Đã tiêu diệt ${mobName}! Nhận ${loot.gold} Vàng.`, 'system');
      if (loot.items && loot.items.length > 0) {
          loot.items.forEach(i => {
              addLog(`🎁 Rơi đồ: [${i.name}]`, 'system');
              showToast(`Nhặt được ${i.name}`, true);
          });
      }
      if (newLevel && newLevel > state.character.level) {
          state.character.level = newLevel;
          showToast(`Lên cấp ${newLevel}!`, true);
      }
  });

  socket.on('force_move', data => {
    GameEngine.setPlayerPos(data.x, data.y);
  });

  socket.on('sys_msg', data => {
    addLog(`⚠️ ${data.msg}`, 'system');
    showToast(data.msg, false);
  });

  socket.on('kicked', data => {
    alert(data.msg);
    window.location.href = '../web-portal/index.html';
  });

  socket.on('attack_result', data => {
    state.bossHp = data.bossHp;
    GameEngine.setBossHp(data.bossHp);
    updateBossUI();
    const isMe = data.attackerName === state.character?.name;
    addLog(`${isMe?'[Bạn]':`[${data.attackerName}]`} Gây ${data.damage.toLocaleString()} sát thương ${data.isCrit?'(Chí mạng! 💥)':''}`, isMe?'player':'guild');
    
    // Queue damage text + VFX to fire at the impact frame of the attack animation
    const b = GameEngine.getBoss();
    if (b && b.alive) {
        GameEngine.queueDamage(
          data.damage,
          b.x + 90,
          b.y + 60,
          data.isCrit,
          false,
          'boss',
          null
        );
    }
  });

  socket.on('boss_attacks_you', data => {
    state.character.hp = data.playerHp;
    updatePlayerUI();
    addLog(`[${data.bossName}] ${data.attackName ? `dùng [${data.attackName}]` : 'Tấn công'} gây ${data.damage.toLocaleString()} sát thương!`, 'boss');
    GameEngine.triggerVfx('player');

    // Show damage text on player
    const p = GameEngine.getPlayer();
    if (p) {
        GameEngine.createDamageText(data.damage, p.x + 32, p.y + 10, false, true);
    }
    if (typeof SoundSystem !== 'undefined') SoundSystem.playerHurt();
  });
  socket.on('sync_mana', data => {
      if (state.character) {
          state.character.mp = data.mp;
          state.character.mpMax = data.mpMax;
          updatePlayerUI();
      }
  });

  socket.on('boss_moved', data => { GameEngine.setBossPos(data.x, data.y); });
  socket.on('boss_attack_anim', () => { 
    GameEngine.setBossAttackAnim(true); 
    GameEngine.triggerVfx('boss_cast');
    const cvs = document.getElementById('gameCanvas');
    if(cvs) { cvs.classList.add('canvas-shake'); setTimeout(() => cvs.classList.remove('canvas-shake'), 400); }
  });
  socket.on('player_dodged', data => { addLog(`✨ NÉ THÀNH CÔNG đòn của ${data.bossName}!`, 'player'); });

  socket.on('boss_killed', data => {
    state.bossHp = 0; GameEngine.setBossHp(0); updateBossUI();
    addLog(`🏆 ${data.killerName} đã tiêu diệt ${data.bossName}!`, 'system');
    if (typeof SoundSystem !== 'undefined') SoundSystem.levelUp();
    if (data.loot) {
      state.lootDrop = data.loot; showLoot(data.loot);
      state.character.level = data.newLevel || (state.character.level + 1);
      state.character.gold = (state.character.gold||0) + data.loot.gold;
      state.character.inventory = [...(state.character.inventory||[]), ...data.loot.items];
      state.character.bossKills = (state.character.bossKills||0) + 1;
      updatePlayerUI(); buildInventoryGrid();
      if (typeof SoundSystem !== 'undefined') SoundSystem.lootPickup();
    }
  });
  socket.on('boss_respawned', data => {
    state.bossHp = data.bossHp; state.bossHpMax = data.bossHp;
    GameEngine.setBoss(650, 120, data.bossHp, data.bossHp);
    updateBossUI();
    addLog(`🔥 ${data.bossName} đã hồi sinh!`, 'boss');
  });

  socket.on('player_hp_update', data => {
    if (state.otherPlayers[data.name]) {
      state.otherPlayers[data.name].hp = data.hp;
      state.otherPlayers[data.name].hpMax = data.hpMax;
    }
  });

  socket.on('you_died', data => {
    state.isDead = true; GameEngine.setDead(true);
    if (typeof SoundSystem !== 'undefined') SoundSystem.playerDead();
    $('death-overlay').style.display = 'flex';
    let t = 5;
    $('death-timer').textContent = t;
    const iv = setInterval(() => { t--; $('death-timer').textContent = t; if (t<=0) clearInterval(iv); }, 1000);
    addLog(`☠️ Bị ${data.killedBy} tiêu diệt!`, 'boss');
  });
  socket.on('you_respawned', data => {
    state.isDead = false; GameEngine.setDead(false);
    $('death-overlay').style.display = 'none';
    state.character.hp = data.hp; state.character.hpMax = data.hpMax;
    GameEngine.setPlayerPos(data.x, data.y);
    GameEngine.setPlayerInfo(state.character.name, data.hp, data.hpMax);
    updatePlayerUI();
    addLog(`✨ Bạn đã hồi sinh!`, 'system');
  });
  socket.on('player_died_in_zone', data => {
    if (state.otherPlayers[data.name]) state.otherPlayers[data.name].isDead = true;
  });
  socket.on('player_respawned_in_zone', data => {
    if (state.otherPlayers[data.name]) { state.otherPlayers[data.name].isDead = false; state.otherPlayers[data.name].hp = data.hp; }
  });

  // Inventory events
  socket.on('inventory_data', data => {
    state.character.inventory = data.inventory;
    state.character.gold = data.gold;
    state.character.calculatedStats = data.calculatedStats;
    state.craftRecipes = data.recipes;
    updatePlayerUI(); buildInventoryGrid();
    if (state.currentPanel === 'craft') {
      openOverlayPanel('craft', true);
    } else if (state.currentPanel === 'stats') {
      openOverlayPanel('stats', true);
    }
  });
  socket.on('item_use_result', data => {
    showToast(data.message, data.success);
    if (data.success && data.player) { 
      Object.assign(state.character, data.player); 
      updatePlayerUI(); 
      buildInventoryGrid(); 
      if (state.currentPanel === 'stats') openOverlayPanel('stats', true);
    }
  });
  socket.on('craft_result', data => {
    showToast(data.message, data.success);
    if (data.success && data.inventory) { 
      state.character.inventory = data.inventory; 
      buildInventoryGrid(); 
      if (state.currentPanel === 'craft') {
        openOverlayPanel('craft', true);
      }
    }
  });

  // NPC Chat
  socket.on('npc_chat_response', data => {
    const { npcId, message } = data;
    const names = { 'merchant': 'Thương nhân', 'elder': 'Trưởng làng', 'guild_manager': 'Quản lý Guild' };
    const npcName = names[npcId] || 'NPC';
    state.npcChatHistory.push({ sender: npcName, text: message, isNpc: true });
    
    if (state.currentPanel === 'npc') {
      updateNpcChatBox();
    } else {
      showToast(`${npcName} đã trả lời bạn!`, true);
    }
  });

  // ====== GAME ACTIONS ======
  function enterZone(zoneId) { socket.emit('enter_zone', zoneId); }
  function exitZone() {
    socket.emit('leave_zone');
    state.activeZone = null; state.otherPlayers = {};
    GameEngine.clearZone(); GameEngine.setOtherPlayers({});
    $('zone-title').textContent = 'Thế Giới AetherWorld';
    $('exit-zone-btn').style.display = 'none';
    $('boss-hud').style.display = 'none';
    $('combat-log-container').style.display = 'none';
    $('skill-bar-hud').style.display = 'none';
    $('loot-overlay').style.display = 'none';
    $('death-overlay').style.display = 'none';
  }

  $('exit-zone-btn').addEventListener('click', () => {
    if (state.activeZone) {
      exitZone();
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('nav-btn--active'));
      $('nav-world').classList.add('nav-btn--active');
    }
  });

  // Portal check interval (world map)
  setInterval(() => {
    if (state.activeZone || state.view !== 'game') return;
    const zoneId = GameEngine.checkPortalCollision();
    if (zoneId) enterZone(zoneId);
  }, 200);

  // ====== AVATAR SPRITE PREVIEW ======
  function updateAvatarSprite(race) {
    if (typeof SpriteSystem === 'undefined') return;
    const previewEl = $('player-sprite-preview');
    const placeholderEl = $('avatar-placeholder');
    if (!previewEl) return;
    
    const config = SpriteSystem.SPRITE_CONFIG ? SpriteSystem.SPRITE_CONFIG[race] : null;
    if (!config) {
      if (placeholderEl) placeholderEl.style.display = 'flex';
      previewEl.style.display = 'none';
      return;
    }
    
    // Use the Idle.png spritesheet
    const url = config.path + 'Idle.png';
    const frames = config.idleFrames || 8;
    
    previewEl.style.backgroundImage = `url('${url}')`;
    // Scale the background so the first frame fits horizontally
    previewEl.style.backgroundSize = `${frames * 100}% 100%`;
    previewEl.style.backgroundPosition = 'left center';
    previewEl.style.backgroundRepeat = 'no-repeat';
    
    previewEl.style.display = 'block';
    previewEl.title = `Model: ${race}`;
    if (placeholderEl) placeholderEl.style.display = 'none';
  }


  // ====== UI UPDATES ======
  function updatePlayerUI() {
    const c = state.character; if (!c) return;
    $('player-name').textContent = c.name;
    $('player-class').textContent = '⚔️ ' + c.class;
    $('player-race').textContent = c.race;
    $('player-level').textContent = 'Lv ' + c.level;
    $('hp-value').textContent = `${(c.hp||0).toLocaleString()} / ${(c.hpMax||0).toLocaleString()}`;
    $('hp-fill').style.width = `${((c.hp||0)/(c.hpMax||1))*100}%`;
    const mpMax = c.mpMax || 1;
    $('mp-value').textContent = `${Math.floor(c.mp||0).toLocaleString()} / ${mpMax.toLocaleString()}`;
    $('mp-fill').style.width = `${((c.mp||0)/mpMax)*100}%`;
    const expPct = ((c.level||1)*750 % 10000)/100;
    $('exp-value').textContent = `${Math.floor(expPct*100)} / 10,000`;
    $('exp-fill').style.width = `${expPct}%`;
    $('gold-amount').textContent = (c.gold||0).toLocaleString();
    $('stat-kills').textContent = c.bossKills || 0;
    $('stat-cr').textContent = (c.combatRating||0).toLocaleString();
    $('inv-count').textContent = `${(c.inventory||[]).length} / 24`;
    updateEquipmentUI();
  }

  function updateEquipmentUI() {
    const c = state.character; if (!c) return;
    const eq = c.equipment || {};
    const slots = [
      { id: 'equip-weapon', key: 'weapon', label: 'Vũ khí', icon: '⚔️' },
      { id: 'equip-armor', key: 'armor', label: 'Giáp', icon: '🛡️' },
      { id: 'equip-helmet', key: 'helmet', label: 'Mũ', icon: '⛑️' },
      { id: 'equip-accessory', key: 'accessory', label: 'Phụ kiện', icon: '💍' }
    ];

    slots.forEach(s => {
      const el = $(s.id);
      if (!el) return;
      const item = eq[s.key];
      if (item) {
        el.className = `equip-slot equip-slot--${item.rarity || 'common'}`;
        el.innerHTML = `
          <div class="equip-slot__icon">${item.icon}</div>
          <div class="equip-slot__name" style="font-size:0.6rem; margin-top:2px; text-align:center;">${item.name}</div>
        `;
        el.title = `${item.name} - Click để tháo`;
        el.onclick = () => socket.emit('unequip_item', { slot: s.key });
      } else {
        el.className = 'equip-slot';
        el.innerHTML = `<div class="equip-slot__icon">${s.icon}</div><div class="equip-slot__label">${s.label}</div>`;
        el.title = `Chưa trang bị ${s.label.toLowerCase()}`;
        el.onclick = null;
      }
    });
  }

  function updateBossUI() {
    const pct = state.bossHpMax > 0 ? (state.bossHp/state.bossHpMax)*100 : 0;
    $('boss-hp-fill').style.width = pct+'%';
    $('boss-hp-text').textContent = `${state.bossHp.toLocaleString()} / ${state.bossHpMax.toLocaleString()}`;
    if (state.activeZone) $('boss-name').textContent = state.activeZone.boss.name;
  }

  // ====== COMBAT LOG ======
  function addLog(text, type) {
    state.combatLogs.unshift({ text, type });
    if (state.combatLogs.length > 30) state.combatLogs.length = 30;
    updateCombatLog();
  }
  function updateCombatLog() {
    const el = $('combat-log');
    el.innerHTML = state.combatLogs.map(l => `<div class="log-entry log-${l.type}">${l.text}</div>`).join('');
  }

  // ====== INVENTORY GRID ======
  function buildInventoryGrid() {
    const grid = $('inventory-grid'); grid.innerHTML = '';
    const inv = state.character?.inventory || [];
    const grouped = {};
    inv.forEach(item => {
      if (grouped[item.name]) grouped[item.name].count++;
      else grouped[item.name] = { ...item, count:1 };
    });
    const items = Object.values(grouped);
    const TOTAL = 24;
    for (let i = 0; i < TOTAL; i++) {
      const slot = document.createElement('div');
      slot.classList.add('inv-slot');
      if (items[i]) {
        const it = items[i];
        slot.classList.add('inv-slot--' + (it.rarity||'common'));
        slot.innerHTML = `<span>${it.icon||'?'}</span>`;
        if (it.count > 1) slot.innerHTML += `<span class="inv-slot__count">${it.count}</span>`;
        slot.title = `${it.name} (${it.rarity}) - Click để sử dụng/giao dịch`;
        slot.addEventListener('click', () => {
            if (tradeState.active && !tradeState.myLocked) {
                window.offerItemToTrade(i);
            } else if (!tradeState.active) {
                socket.emit('use_item', { itemName: it.name });
            }
        });
      }
      grid.appendChild(slot);
    }
    $('inv-count').textContent = `${inv.length} / ${TOTAL}`;
  }

  // ====== LOOT DISPLAY ======
  function showLoot(loot) {
    const el = $('loot-items'); el.innerHTML = '';
    loot.items.forEach(it => {
      el.innerHTML += `<div class="loot-item"><span class="loot-item__icon">${it.icon}</span><div><div class="loot-item__name" style="color:${it.color||'#fff'}">${it.name}</div><div class="loot-item__meta">${it.rarityLabel||it.rarity} · ${it.type}</div></div></div>`;
    });
    $('loot-gold').textContent = `💰 +${loot.gold.toLocaleString()} Vàng`;
    $('loot-overlay').style.display = 'flex';
    setTimeout(() => { $('loot-overlay').style.display = 'none'; }, 12000);
  }
  $('loot-collect-btn').addEventListener('click', () => { $('loot-overlay').style.display = 'none'; });
  $('loot-exit-btn').addEventListener('click', () => {
    $('loot-overlay').style.display = 'none';
    if (state.activeZone) {
      exitZone();
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('nav-btn--active'));
      $('nav-world').classList.add('nav-btn--active');
    }
  });

  // ====== OVERLAY PANELS (Stats, Shop, Guilds, Craft, Settings) ======
  function closeOverlayPanel() { $('overlay-panel').style.display = 'none'; state.currentPanel = null; }

  function openOverlayPanel(panel, force = false) {
    if (state.currentPanel === panel && !force) { closeOverlayPanel(); return; }
    state.currentPanel = panel;

    if (panel === 'craft' && !force) {
      socket.emit('get_inventory');
    }

    const content = $('overlay-content');
    let html = `<div class="overlay-panel__header"><h2 class="overlay-panel__title">${getPanelTitle(panel)}</h2><button class="btn-close-overlay" id="close-overlay">✕</button></div>`;
    html += getPanelContent(panel);
    content.innerHTML = html;
    $('overlay-panel').style.display = 'flex';
    $('close-overlay').addEventListener('click', closeOverlayPanel);

    // Bind craft buttons
    if (panel === 'craft') {
      content.querySelectorAll('[data-craft]').forEach(btn => {
        btn.addEventListener('click', () => {
          btn.disabled = true;
          btn.textContent = '...';
          socket.emit('craft_item', { recipeId: btn.dataset.craft });
        });
      });
    }

    // Bind NPC Chat buttons
    if (panel === 'npc') {
      updateNpcChatBox(); // Initialize chat scroll
      const chatForm = $('npc-chat-form');
      if (chatForm) {
        chatForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const input = $('npc-chat-input');
          const npcSelect = $('npc-select');
          const msg = input.value.trim();
          if (!msg) return;

          // Add my message to history
          const myName = state.character ? state.character.name : 'Bạn';
          state.npcChatHistory.push({ sender: myName, text: msg, isNpc: false });
          updateNpcChatBox();
          
          // Send to server
          socket.emit('npc_chat', { npcId: npcSelect.value, message: msg });
          input.value = '';
          
          // Add typing indicator
          state.npcChatHistory.push({ sender: 'Typing', text: '...', isTyping: true });
          updateNpcChatBox();
        });
      }
    }
  }

  function updateNpcChatBox() {
    const box = $('npc-chat-history');
    if (!box) return;
    
    // Remove typing indicator if we have a real response
    if (state.npcChatHistory.length > 0) {
      const last = state.npcChatHistory[state.npcChatHistory.length - 1];
      const secondLast = state.npcChatHistory[state.npcChatHistory.length - 2];
      if (!last.isTyping && secondLast?.isTyping) {
        state.npcChatHistory.splice(state.npcChatHistory.length - 2, 1);
      }
    }

    box.innerHTML = state.npcChatHistory.map(msg => {
      if (msg.isTyping) {
        return `<div style="text-align:left; margin-bottom: 8px;"><span style="display:inline-block; padding: 6px 10px; border-radius: 8px; background: rgba(255,255,255,0.1); color: var(--clr-text-muted); font-size: 0.8rem; font-style: italic;">Đang suy nghĩ...</span></div>`;
      }
      return `<div style="text-align: ${msg.isNpc ? 'left' : 'right'}; margin-bottom: 12px;">
        <div style="font-size: 0.7rem; color: ${msg.isNpc ? '#ff9f1c' : 'var(--clr-text-muted)'}; margin-bottom: 2px;">${msg.sender}</div>
        <div style="display:inline-block; padding: 8px 12px; border-radius: 8px; background: ${msg.isNpc ? 'rgba(255,159,28,0.15)' : 'rgba(6,214,160,0.15)'}; border: 1px solid ${msg.isNpc ? 'rgba(255,159,28,0.3)' : 'rgba(6,214,160,0.3)'}; color: #fff; font-size: 0.9rem; text-align: left; word-break: break-word; max-width: 90%;">
          ${msg.text.replace(/\n/g, '<br>')}
        </div>
      </div>`;
    }).join('');
    box.scrollTop = box.scrollHeight;
  }

  function getPanelTitle(p) {
    return { stats:'📊 CHỈ SỐ NHÂN VẬT', shop:'🛒 CỬA HÀNG', guilds:'👥 BANG HỘI', craft:'🔨 CHẾ TẠO', settings:'⚙️ CÀI ĐẶT', npc:'💬 TRÒ CHUYỆN NPC', players:'👥 NGƯỜI CHƠI QUANH ĐÂY' }[p] || '';
  }

  function getPanelContent(p) {
    const c = state.character || {};
    if (p === 'stats') {
      const s = c.calculatedStats || { attack: 0, defensePct: 0, fireResist: 0, waterResist: 0, natureResist: 0, darkResist: 0, allResist: 0 };
      const fire = s.fireResist + s.allResist;
      const water = s.waterResist + s.allResist;
      const nature = s.natureResist + s.allResist;
      const dark = s.darkResist + s.allResist;
      return `<div style="display:flex;flex-direction:column;gap:12px">
        <div class="mini-stat"><span class="mini-stat__label">Tên</span><span class="mini-stat__value">${c.name}</span></div>
        <div class="mini-stat"><span class="mini-stat__label">Class</span><span class="mini-stat__value">${c.class}</span></div>
        <div class="mini-stat"><span class="mini-stat__label">Race</span><span class="mini-stat__value">${c.race}</span></div>
        <div class="mini-stat"><span class="mini-stat__label">Level</span><span class="mini-stat__value">${c.level}</span></div>
        <div class="mini-stat"><span class="mini-stat__label">HP Max</span><span class="mini-stat__value">${(c.hpMax||0).toLocaleString()}</span></div>
        <div class="mini-stat"><span class="mini-stat__label">Sức mạnh (ATK)</span><span class="mini-stat__value">${s.attack.toLocaleString()}</span></div>
        <div class="mini-stat"><span class="mini-stat__label">Giáp vật lý</span><span class="mini-stat__value">+${s.defensePct}%</span></div>
        ${fire > 0 ? `<div class="mini-stat"><span class="mini-stat__label" style="color:#ff5a5f">Kháng Lửa</span><span class="mini-stat__value">+${fire}</span></div>` : ''}
        ${water > 0 ? `<div class="mini-stat"><span class="mini-stat__label" style="color:#00b4d8">Kháng Nước</span><span class="mini-stat__value">+${water}</span></div>` : ''}
        ${nature > 0 ? `<div class="mini-stat"><span class="mini-stat__label" style="color:#80ed99">Kháng Tự nhiên</span><span class="mini-stat__value">+${nature}</span></div>` : ''}
        ${dark > 0 ? `<div class="mini-stat"><span class="mini-stat__label" style="color:#9d4edd">Kháng Bóng tối</span><span class="mini-stat__value">+${dark}</span></div>` : ''}
        <div class="mini-stat"><span class="mini-stat__label">Combat Rating</span><span class="mini-stat__value" style="color:#ff9f1c;font-weight:bold">${(c.combatRating||0).toLocaleString()}</span></div>
        <div class="mini-stat"><span class="mini-stat__label">Vàng</span><span class="mini-stat__value" style="color:var(--clr-gold)">${(c.gold||0).toLocaleString()}</span></div>
      </div>`;
    }
    if (p === 'shop') {
      return `<div style="text-align:center;color:var(--clr-text-muted);padding:40px"><p style="font-size:2rem;margin-bottom:12px">🏗️</p><p>Cửa hàng đang được xây dựng...</p><p style="font-size:0.75rem;margin-top:8px">Hãy đánh boss để nhận vật phẩm!</p></div>`;
    }
    if (p === 'guilds') {
      return `<div style="text-align:center;color:var(--clr-text-muted);padding:40px"><p style="font-size:2rem;margin-bottom:12px">👥</p><p>Hệ thống bang hội sắp ra mắt!</p><p style="font-size:0.75rem;margin-top:8px">Tham gia zone Guild (🌐) để chơi cùng bạn bè</p></div>`;
    }
    if (p === 'craft') {
      const recipes = state.craftRecipes || [];
      if (!recipes.length) return `<div style="text-align:center;color:var(--clr-text-muted);padding:40px">Đang tải công thức...</div>`;
      const inv = c.inventory || [];
      return recipes.map(r => {
        const canCraft = r.ingredients.every(ing => inv.filter(i=>i.name===ing.name).length >= ing.count);
        return `<div style="background:rgba(255,255,255,0.03);border-radius:12px;padding:14px;margin-bottom:10px;border:1px solid ${canCraft?'rgba(255,159,28,0.3)':'rgba(255,255,255,0.05)'}">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <span style="font-size:1.8rem">${r.icon}</span>
            <div><div style="font-weight:bold;color:#ff9f1c;font-family:var(--font-display)">${r.name}</div><div style="font-size:0.7rem;color:var(--clr-text-muted)">${r.description}</div></div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">${r.ingredients.map(ing => {
            const have = inv.filter(i=>i.name===ing.name).length;
            const ok = have >= ing.count;
            return `<span style="font-size:0.7rem;padding:3px 8px;border-radius:6px;background:${ok?'rgba(6,214,160,0.1)':'rgba(239,71,111,0.1)'};color:${ok?'var(--clr-success)':'var(--clr-hp)'};border:1px solid ${ok?'rgba(6,214,160,0.3)':'rgba(239,71,111,0.3)'}">${ing.name} ${have}/${ing.count}</span>`;
          }).join('')}</div>
          <button data-craft="${r.id}" ${canCraft?'':'disabled'} style="width:100%;padding:8px;border-radius:8px;border:none;font-weight:bold;cursor:${canCraft?'pointer':'not-allowed'};background:${canCraft?'linear-gradient(45deg,#ff9f1c,#ffd166)':'rgba(255,255,255,0.05)'};color:${canCraft?'#0b0914':'var(--clr-text-muted)'};font-family:var(--font-display);letter-spacing:1px">${canCraft?'🔨 CHẾ TẠO':'THIẾU NGUYÊN LIỆU'}</button>
        </div>`;
      }).join('');
    }
    if (p === 'settings') {
      return `<div style="display:flex;flex-direction:column;gap:12px">
        <div class="mini-stat"><span class="mini-stat__label">Trạng thái</span><span class="mini-stat__value" style="color:var(--clr-success)">${state.connected?'Đã kết nối':'Mất kết nối'}</span></div>
        <div class="mini-stat"><span class="mini-stat__label">Tài khoản</span><span class="mini-stat__value">${state.isLoggedIn?(localStorage.getItem('aether_user')||'N/A'):'Khách'}</span></div>
        <div class="mini-stat"><span class="mini-stat__label">Server</span><span class="mini-stat__value" style="font-size:0.6rem">${SERVER}</span></div>
        ${state.activeZone?`<button onclick="document.getElementById('nav-world').click()" style="padding:10px;border-radius:8px;border:1px solid var(--clr-primary);background:none;color:var(--clr-secondary);cursor:pointer;font-family:var(--font-display)">🗺️ QUAY LẠI BẢN ĐỒ</button>`:''}
      </div>`;
    }
    if (p === 'npc') {
      return `
        <div style="display:flex;flex-direction:column;height:100%;max-height:60vh;">
          <div style="margin-bottom: 10px;">
            <select id="npc-select" style="width:100%; padding: 8px; border-radius: 8px; background: rgba(0,0,0,0.3); color: #fff; border: 1px solid rgba(255,255,255,0.2); outline: none;">
              <option value="merchant">💰 Thương nhân (Bán đồ)</option>
              <option value="elder">🧙 Trưởng làng (Thông tin)</option>
              <option value="guild_manager">⚔️ Quản lý Guild (Đấu trường)</option>
            </select>
          </div>
          <div id="npc-chat-history" style="flex:1; overflow-y:auto; background: rgba(0,0,0,0.2); border-radius: 8px; padding: 10px; margin-bottom: 10px; border: 1px solid rgba(255,255,255,0.1); display:flex; flex-direction:column; gap:8px;">
            <div style="text-align:center; color: var(--clr-text-muted); font-size: 0.8rem; padding: 20px;">Hãy chọn NPC và bắt đầu trò chuyện bằng AI (Gemini).</div>
          </div>
          <form id="npc-chat-form" style="display:flex; gap: 8px;">
            <input type="text" id="npc-chat-input" placeholder="Hỏi đường, trả giá, trò chuyện..." style="flex:1; padding: 10px; border-radius: 8px; border: 1px solid rgba(255,159,28,0.4); background: rgba(0,0,0,0.4); color: #fff; outline: none;" required autocomplete="off" />
            <button type="submit" style="padding: 10px 16px; border-radius: 8px; background: linear-gradient(45deg, #ff9f1c, #ffd166); border: none; font-weight: bold; color: #0b0914; cursor: pointer;">GỬI</button>
          </form>
        </div>
        </div>
      `;
    }
    if (p === 'players') {
      const others = Object.values(state.otherPlayers || {});
      if (!others.length) return `<div style="text-align:center;color:var(--clr-text-muted);padding:40px">Không có ai xung quanh.</div>`;
      return `<div style="display:flex;flex-direction:column;gap:10px;">` + others.map(op => `
        <div style="background:rgba(255,255,255,0.03);border-radius:12px;padding:14px;border:1px solid rgba(255,255,255,0.05);display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:bold;color:var(--clr-primary);font-size:1.1rem;">${op.name}</div>
            <div style="font-size:0.8rem;color:var(--clr-text-muted)">Lv ${op.level} - ${op.class}</div>
          </div>
          <button onclick="window.requestTrade('${op.name}')" class="btn-action" style="padding:6px 12px; font-size:0.8rem; background:rgba(6,214,160,0.2); border-color:rgba(6,214,160,0.5);">🤝 GIAO DỊCH</button>
          <button onclick="window.inviteParty('${op.name}')" class="btn-action" style="padding:6px 12px; font-size:0.8rem; background:rgba(157,78,221,0.2); border-color:rgba(157,78,221,0.5); margin-left: 5px;">👥 TỔ ĐỘI</button>
        </div>
      `).join('') + `</div>`;
    }
    return '';
  }

  // ====== NAV BUTTONS ======
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.dataset.panel;
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('nav-btn--active'));
      btn.classList.add('nav-btn--active');

      if (panel === 'world') {
        closeOverlayPanel();
        if (state.activeZone) exitZone();
      } else {
        openOverlayPanel(panel);
      }
    });
  });

  // ====== PARTY SYSTEM ======
  window.inviteParty = (targetName) => {
      socket.emit('party_invite', targetName);
      showToast(`Đã gửi lời mời tổ đội cho ${targetName}`, true);
  };

  socket.on('party_invite_received', data => {
      $('party-req-name').textContent = data.from;
      $('party-req-overlay').style.display = 'flex';
      
      $('party-accept-btn').onclick = () => {
          socket.emit('party_accept', data.fromId);
          $('party-req-overlay').style.display = 'none';
      };
      $('party-decline-btn').onclick = () => {
          $('party-req-overlay').style.display = 'none';
      };
  });

  socket.on('party_update', data => {
      if (!data || !data.members || data.members.length === 0) {
          $('party-hud').style.display = 'none';
          $('party-members-list').innerHTML = '';
          return;
      }
      $('party-hud').style.display = 'flex';
      $('party-members-list').innerHTML = data.members.map(m => {
        const hpPct = Math.max(0, Math.min(100, (m.hp / m.hpMax) * 100));
        return `
        <div style="background:rgba(0,0,0,0.6); padding:6px 10px; border-radius:4px; border-left:3px solid var(--clr-primary); font-size:0.85rem; display:flex; flex-direction:column; gap:4px; width: 140px;">
           <div style="display:flex; justify-content:space-between; align-items:center;">
             <span style="color:#fff; font-weight:bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:80px;">${m.name}</span>
             <span style="color:var(--clr-gold); font-size:0.7rem;">Lv ${m.level}</span>
           </div>
           <div style="width:100%; height:4px; background:rgba(255,255,255,0.2); border-radius:2px; overflow:hidden;">
             <div style="width:${hpPct}%; height:100%; background:var(--clr-hp); transition: width 0.3s;"></div>
           </div>
        </div>
      `}).join('');
  });

  $('btn-leave-party').addEventListener('click', () => { socket.emit('party_leave'); });

  // ====== TRADE SYSTEM ======
  let tradeState = { active: false, myLocked: false, theirLocked: false, partnerName: '' };
  
  window.requestTrade = (targetName) => {
      socket.emit('trade_request', { targetName });
      showToast(`Đã gửi lời mời giao dịch cho ${targetName}`, true);
  };

  socket.on('trade_requested', data => {
      $('trade-req-name').textContent = data.requesterName;
      $('trade-req-overlay').style.display = 'flex';
      
      $('trade-accept-btn').onclick = () => {
          socket.emit('trade_accept', { targetName: data.requesterName });
          $('trade-req-overlay').style.display = 'none';
      };
      $('trade-decline-btn').onclick = () => {
          socket.emit('trade_decline', { targetName: data.requesterName });
          $('trade-req-overlay').style.display = 'none';
      };
  });

  socket.on('trade_declined', data => {
      showToast(`${data.targetName} đã từ chối giao dịch.`, false);
  });

  socket.on('trade_started', data => {
      tradeState = { active: true, partnerName: data.partnerName, myLocked: false, theirLocked: false };
      $('trade-partner-title').textContent = data.partnerName;
      $('trade-my-gold').value = 0;
      $('trade-their-gold').textContent = '0';
      $('trade-my-items').innerHTML = '';
      $('trade-their-items').innerHTML = '';
      $('trade-my-status').innerHTML = '<span style="color:var(--clr-text-muted);">Chưa Khóa</span>';
      $('trade-their-status').innerHTML = '<span style="color:var(--clr-text-muted);">Chưa Khóa</span>';
      $('trade-lock-btn').style.background = 'rgba(255,159,28,0.2)';
      $('trade-lock-btn').textContent = '🔒 KHÓA';
      $('trade-confirm-btn').disabled = true;
      $('trade-confirm-btn').style.cursor = 'not-allowed';
      $('trade-confirm-btn').style.background = 'rgba(255,255,255,0.1)';
      $('trade-window-overlay').style.display = 'flex';
      
      // Mở túi đồ
      if(state.currentPanel !== 'inventory') $('inventory-btn').click();
  });

  socket.on('trade_update', data => {
      // Update their UI
      $('trade-their-gold').textContent = data.theirGold.toLocaleString();
      $('trade-their-items').innerHTML = data.theirItems.map(item => `<div style="width:30px;height:30px;background:rgba(255,255,255,0.1);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:16px;" title="${item.name}">${item.icon||'📦'}</div>`).join('');
      
      // Update my UI
      if(document.activeElement !== $('trade-my-gold')) {
          $('trade-my-gold').value = data.myGold;
      }
      $('trade-my-items').innerHTML = data.myItems.map(item => `<div style="width:30px;height:30px;background:rgba(255,255,255,0.1);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:16px;cursor:pointer;" title="Bỏ ra: ${item.name}" onclick="socket.emit('trade_remove_item', {index: ${item.originalIndex}})">${item.icon||'📦'}</div>`).join('');
      
      tradeState.theirLocked = data.theirLocked;
      $('trade-their-status').innerHTML = tradeState.theirLocked ? '<span style="color:var(--clr-success);">Đã Khóa</span>' : '<span style="color:var(--clr-text-muted);">Chưa Khóa</span>';
      
      tradeState.myLocked = data.myLocked;
      $('trade-my-status').innerHTML = tradeState.myLocked ? '<span style="color:var(--clr-success);">Đã Khóa</span>' : '<span style="color:var(--clr-text-muted);">Chưa Khóa</span>';
      $('trade-lock-btn').textContent = tradeState.myLocked ? '🔓 MỞ KHÓA' : '🔒 KHÓA';
      $('trade-lock-btn').style.background = tradeState.myLocked ? 'rgba(6,214,160,0.2)' : 'rgba(255,159,28,0.2)';

      if (tradeState.myLocked && tradeState.theirLocked) {
          $('trade-confirm-btn').disabled = false;
          $('trade-confirm-btn').style.cursor = 'pointer';
          $('trade-confirm-btn').style.background = 'rgba(6,214,160,0.2)';
          $('trade-confirm-btn').style.color = 'var(--clr-success)';
          $('trade-confirm-btn').textContent = '✅ XÁC NHẬN';
      } else {
          $('trade-confirm-btn').disabled = true;
          $('trade-confirm-btn').style.cursor = 'not-allowed';
          $('trade-confirm-btn').style.background = 'rgba(255,255,255,0.1)';
          $('trade-confirm-btn').style.color = 'var(--clr-text-muted)';
          $('trade-confirm-btn').textContent = '✅ XÁC NHẬN';
      }
  });

  socket.on('trade_cancelled', data => {
      $('trade-window-overlay').style.display = 'none';
      tradeState.active = false;
      showToast(data.msg || "Giao dịch đã bị hủy", false);
      buildInventoryGrid(); // Render lại túi đồ
  });

  socket.on('trade_completed', data => {
      $('trade-window-overlay').style.display = 'none';
      tradeState.active = false;
      showToast("Giao dịch thành công!", true);
  });

  // UI Event Listeners for Trade
  $('trade-cancel-btn').addEventListener('click', () => { socket.emit('trade_cancel'); });
  
  window.offerGoldToTrade = () => {
      if(tradeState.myLocked) return;
      const amount = parseInt($('trade-my-gold').value) || 0;
      socket.emit('trade_update_offer', { gold: amount, items: null });
  };

  $('trade-my-gold-btn').addEventListener('click', () => {
      window.offerGoldToTrade();
  });
  
  $('trade-lock-btn').addEventListener('click', () => { 
      window.offerGoldToTrade(); // Sync gold right before lock
      setTimeout(() => { socket.emit('trade_lock'); }, 10);
  });
  
  $('trade-confirm-btn').addEventListener('click', () => { 
      socket.emit('trade_confirm'); 
      $('trade-confirm-btn').textContent = "⏳ Đang đợi...";
      $('trade-confirm-btn').disabled = true;
  });

  // Auto-sync gold on typing
  $('trade-my-gold').addEventListener('input', () => {
      window.offerGoldToTrade();
  });

  // Update Inventory click to offer items
  window.offerItemToTrade = (itemIndex) => {
      if (!tradeState.active || tradeState.myLocked) return;
      socket.emit('trade_add_item', { index: itemIndex });
      
      // Optimistic UI
      const myItemsContainer = $('trade-my-items');
      const item = state.character.inventory[itemIndex];
      myItemsContainer.innerHTML += `<div style="width:30px;height:30px;background:rgba(255,255,255,0.1);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:16px;cursor:pointer;" onclick="window.removeItemFromTrade(${itemIndex}, this)" title="${item.name}">${item.icon||'📦'}</div>`;
      
      // Hide from inventory grid temporarily
      buildInventoryGrid();
  };

  window.removeItemFromTrade = (itemIndex, el) => {
      if (!tradeState.active || tradeState.myLocked) return;
      socket.emit('trade_remove_item', { index: itemIndex });
      el.remove();
      buildInventoryGrid();
  };

  // ====== TOAST ======
  function showToast(msg, success) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast ' + (success ? 'toast--success' : 'toast--error');
    t.style.display = 'block';
    setTimeout(() => { t.style.display = 'none'; }, 3000);
  }

  // KEYBOARD & SKILLS
  const keys = {};

  function startCooldownUI(skillKey, cooldownTime) {
      const btn = $(`skill-${skillKey}`);
      if (!btn) return;
      const overlay = btn.querySelector('.cooldown-overlay');
      if (!overlay) return;

      overlay.style.height = "100%";
      const startTime = Date.now();

      function animateCooldown() {
          const elapsed = Date.now() - startTime;
          const remaining = Math.max(0, cooldownTime - elapsed);
          const percentage = (remaining / cooldownTime) * 100;

          overlay.style.height = `${percentage}%`;

          if (percentage > 0) {
              requestAnimationFrame(animateCooldown);
          }
      }
      
      requestAnimationFrame(animateCooldown);
  }
  
  function useSkill(key) {
      if (!state.skills) return;
      const skillKey = key.toLowerCase(); 
      const skill = state.skills[skillKey];

      if (!skill) return; 

      const currentTime = Date.now();
      if (!skill.lastUsed) skill.lastUsed = 0;

      // 1. Cooldown
      if (currentTime - skill.lastUsed < skill.cooldown) {
          const remainingTime = ((skill.cooldown - (currentTime - skill.lastUsed)) / 1000).toFixed(1);
          addLog(`Chiêu [${skill.name}] đang hồi... ${remainingTime}s!`, 'system');
          return;
      }

      // 2. Mana
      if (state.character.mp < skill.manaCost) {
          addLog(`Không đủ Mana để dùng [${skill.name}]!`, 'system');
          return;
      }

      // 3. Cast
      state.character.mp -= skill.manaCost;
      skill.lastUsed = currentTime;
      updatePlayerUI();
      startCooldownUI(skillKey, skill.cooldown);

      addLog(`⚡ Tung chiêu: ${skill.name}! (-${skill.manaCost} MP)`, 'player');
      if (typeof SoundSystem !== 'undefined') SoundSystem.skill();
      if (state.activeZone) {
          socket.emit('use_skill', { skillKey });
      }
  }

  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.code === 'Space') {
      if (state.activeZone && state.activeZone.type === 'pvp') {
        const now = Date.now();
        if (now - lastBasicAttack < basicAttackCooldown) return;
        lastBasicAttack = now;

        let target = null;
        let minDist = Infinity;
        Object.values(state.otherPlayers).forEach(p => {
           if (p.isDead) return;
           const dx = p.x - state.character.x;
           const dy = p.y - state.character.y;
           const dist = Math.sqrt(dx*dx + dy*dy);
           if (dist < minDist && dist < 100) { minDist = dist; target = p; }
        });
        if (target) socket.emit('pvp_attack', target.name);
      }
    } 
    else if (['1', '2', '3', '4', 'r', 'R'].includes(e.key)) {
        useSkill(e.key);
    }
  });

  // ====== INIT ======
  let lastBasicAttack = 0;
  const basicAttackCooldown = 1500; // 1.5s cooldown cho đánh thường
  let lastClientRegenTime = Date.now();

  function clientManaLoop() {
      const now = Date.now();
      const dt = (now - lastClientRegenTime) / 1000;
      lastClientRegenTime = now;

      if (state.character && state.character.mp < state.character.mpMax) {
          const regenAmount = state.character.mpMax * 0.01 * dt;
          state.character.mp = Math.min(state.character.mpMax, state.character.mp + regenAmount);
          updatePlayerUI();
      }
      requestAnimationFrame(clientManaLoop);
  }

  async function init() {
    await GameEngine.preloadAssets(SERVER);
    GameEngine.init(document.getElementById('gameCanvas'), {
      onMove: (x,y) => { if (state.activeZone) socket.emit('player_move', {x,y}); },
      onAttack: (mobId) => {
        if (!state.activeZone || state.isDead) return false;
        const now = Date.now();
        if (now - lastBasicAttack < basicAttackCooldown) return false;
        lastBasicAttack = now;
        // Sound
        if (typeof SoundSystem !== 'undefined') {
          if (state.character && state.character.race === 'Human') SoundSystem.magicBolt();
          else SoundSystem.swing();
        }
        if (mobId) {
            socket.emit('attack_mob', mobId);
        } else if (state.bossHp > 0) {
            socket.emit('attack');
        }
        return true;
      }
    });
    buildInventoryGrid();
    requestAnimationFrame(clientManaLoop);
    // Start ambient music
    if (typeof SoundSystem !== 'undefined') SoundSystem.startMusic();
    initMobileControls();
    showTutorialIfFirst();

    // Auto-connect
    const hasToken = localStorage.getItem('aether_token');
    if (hasToken) { showView('loading'); }
    socket.connect();

    new ResizeObserver(() => GameEngine.resizeCanvas()).observe(document.getElementById('gameCanvas').parentElement);
  }


  // ====== PORTAL SOUND ======
  const _origPortalCheck = setInterval;
  const _enterZone_orig = (() => {
    const _fn = window._aetherEnterZone;
    return _fn;
  })();

  // Patch enterZone globally for sound
  function _patchEnterZoneSound() {
    const origInterval = setInterval(() => {
      if (state.activeZone || state.view !== 'game') return;
      const zoneId = GameEngine.checkPortalCollision();
      if (zoneId) {
        if (typeof SoundSystem !== 'undefined') SoundSystem.portalEnter();
        enterZone(zoneId);
      }
    }, 200);
  }

  // ====== MOBILE CONTROLS ======
  function initMobileControls() {
    const isMobile = /Android|iPhone|iPad|iPod|Touch/i.test(navigator.userAgent) || window.innerWidth < 768;
    if (!isMobile) return;

    const container = document.createElement('div');
    container.id = 'mobile-controls';
    container.style.cssText = `
      position: fixed; bottom: 0; left: 0; right: 0; height: 180px;
      display: flex; align-items: flex-end; justify-content: space-between;
      padding: 16px 24px; pointer-events: none; z-index: 900;
    `;

    // Virtual Joystick
    const joystickZone = document.createElement('div');
    joystickZone.style.cssText = 'width:120px;height:120px;position:relative;pointer-events:all;';
    const joystickBase = document.createElement('div');
    joystickBase.style.cssText = 'width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,0.08);border:2px solid rgba(255,255,255,0.2);position:absolute;top:0;left:0;';
    const joystickKnob = document.createElement('div');
    joystickKnob.style.cssText = 'width:48px;height:48px;border-radius:50%;background:rgba(157,78,221,0.7);border:2px solid rgba(220,150,255,0.6);position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);transition:background 0.1s;';
    joystickZone.append(joystickBase, joystickKnob);

    let joystickActive = false, joystickOrigin = { x: 0, y: 0 };
    joystickZone.addEventListener('touchstart', e => {
      e.preventDefault();
      joystickActive = true;
      const t = e.touches[0];
      const r = joystickZone.getBoundingClientRect();
      joystickOrigin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      joystickKnob.style.background = 'rgba(220,130,255,0.9)';
    }, { passive: false });
    joystickZone.addEventListener('touchmove', e => {
      e.preventDefault();
      if (!joystickActive) return;
      const t = e.touches[0];
      const dx = t.clientX - joystickOrigin.x;
      const dy = t.clientY - joystickOrigin.y;
      const dist = Math.min(Math.sqrt(dx*dx + dy*dy), 48);
      const angle = Math.atan2(dy, dx);
      const kx = Math.cos(angle) * dist;
      const ky = Math.sin(angle) * dist;
      joystickKnob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
      const norm = dist / 48;
      GameEngine.setVirtualInput({ x: (dx / 48) * norm, y: (dy / 48) * norm });
    }, { passive: false });
    const resetJoystick = () => {
      joystickActive = false;
      joystickKnob.style.transform = 'translate(-50%,-50%)';
      joystickKnob.style.background = 'rgba(157,78,221,0.7)';
      GameEngine.setVirtualInput({ x: 0, y: 0 });
    };
    joystickZone.addEventListener('touchend', resetJoystick);
    joystickZone.addEventListener('touchcancel', resetJoystick);

    // Right side buttons
    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display:flex;flex-direction:column;gap:12px;align-items:center;pointer-events:all;';

    const mkBtn = (label, color, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = `width:64px;height:64px;border-radius:50%;border:2px solid ${color};background:rgba(0,0,0,0.5);color:#fff;font-size:1.1rem;font-weight:bold;cursor:pointer;`;
      b.addEventListener('touchstart', e => { e.preventDefault(); fn(); }, { passive: false });
      return b;
    };

    const attackBtn = mkBtn('⚔️', 'rgba(239,71,111,0.8)', () => {
      if (!state.activeZone || state.isDead) return;
      const now = Date.now();
      if (now - lastBasicAttack < basicAttackCooldown) return;
      lastBasicAttack = now;
      if (typeof SoundSystem !== 'undefined') {
        if (state.character && state.character.race === 'Human') SoundSystem.magicBolt();
        else SoundSystem.swing();
      }
      const mob = GameEngine.getNearestMob ? GameEngine.getNearestMob() : null;
      if (mob) socket.emit('attack_mob', mob.id);
      else if (state.bossHp > 0) socket.emit('attack');
    });

    const dodgeBtn = mkBtn('💨', 'rgba(6,214,160,0.8)', () => {
      if (typeof GameEngine.triggerVirtualDodge === 'function') GameEngine.triggerVirtualDodge();
    });

    btnGroup.append(attackBtn, dodgeBtn);
    container.append(joystickZone, btnGroup);
    document.body.appendChild(container);
  }

  // ====== TUTORIAL ======
  function showTutorialIfFirst() {
    if (localStorage.getItem('aether_tutorial_seen')) return;
    const overlay = document.createElement('div');
    overlay.id = 'tutorial-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);
      display:flex;align-items:center;justify-content:center;
    `;
    overlay.innerHTML = `
      <div style="max-width:480px;width:90%;background:linear-gradient(135deg,#0e0b1e,#1a1040);border:1px solid rgba(157,78,221,0.4);border-radius:16px;padding:32px;text-align:center;color:#fff;font-family:'Inter',sans-serif;">
        <div style="font-size:3rem;margin-bottom:12px;">⚔️</div>
        <h2 style="font-family:'Cinzel',serif;font-size:1.5rem;color:#e0aaff;margin-bottom:8px;">Chào mừng đến AetherWorld</h2>
        <p style="color:rgba(255,255,255,0.6);font-size:0.85rem;margin-bottom:24px;">Hướng dẫn nhanh để bắt đầu hành trình</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:28px;text-align:left;">
          <div style="background:rgba(157,78,221,0.1);border:1px solid rgba(157,78,221,0.2);border-radius:10px;padding:12px;">
            <div style="font-size:1.4rem;margin-bottom:6px;">🗺️</div>
            <div style="font-weight:600;margin-bottom:3px;font-size:0.9rem;">Di Chuyển</div>
            <div style="color:rgba(255,255,255,0.5);font-size:0.8rem;"><kbd style="background:rgba(255,255,255,0.1);border-radius:4px;padding:1px 5px;">W A S D</kbd> hoặc mũi tên</div>
          </div>
          <div style="background:rgba(239,71,111,0.1);border:1px solid rgba(239,71,111,0.2);border-radius:10px;padding:12px;">
            <div style="font-size:1.4rem;margin-bottom:6px;">⚔️</div>
            <div style="font-weight:600;margin-bottom:3px;font-size:0.9rem;">Tấn Công</div>
            <div style="color:rgba(255,255,255,0.5);font-size:0.8rem;"><kbd style="background:rgba(255,255,255,0.1);border-radius:4px;padding:1px 5px;">Space</kbd> khi gần quái/boss</div>
          </div>
          <div style="background:rgba(6,214,160,0.1);border:1px solid rgba(6,214,160,0.2);border-radius:10px;padding:12px;">
            <div style="font-size:1.4rem;margin-bottom:6px;">💨</div>
            <div style="font-weight:600;margin-bottom:3px;font-size:0.9rem;">Né Đòn</div>
            <div style="color:rgba(255,255,255,0.5);font-size:0.8rem;"><kbd style="background:rgba(255,255,255,0.1);border-radius:4px;padding:1px 5px;">Shift</kbd> — hồi 2.5 giây</div>
          </div>
          <div style="background:rgba(255,159,28,0.1);border:1px solid rgba(255,159,28,0.2);border-radius:10px;padding:12px;">
            <div style="font-size:1.4rem;margin-bottom:6px;">✨</div>
            <div style="font-weight:600;margin-bottom:3px;font-size:0.9rem;">Chiêu Thức</div>
            <div style="color:rgba(255,255,255,0.5);font-size:0.8rem;"><kbd style="background:rgba(255,255,255,0.1);border-radius:4px;padding:1px 5px;">1</kbd> <kbd style="background:rgba(255,255,255,0.1);border-radius:4px;padding:1px 5px;">2</kbd> <kbd style="background:rgba(255,255,255,0.1);border-radius:4px;padding:1px 5px;">3</kbd> <kbd style="background:rgba(255,255,255,0.1);border-radius:4px;padding:1px 5px;">4</kbd> <kbd style="background:rgba(255,255,255,0.1);border-radius:4px;padding:1px 5px;">R</kbd></div>
          </div>
        </div>
        <p style="color:rgba(255,255,255,0.45);font-size:0.8rem;margin-bottom:20px;">Di chuyển trên bản đồ để bước vào cổng khu vực chiến đấu</p>
        <button id="tutorial-close-btn" style="background:linear-gradient(135deg,#9d4edd,#7b2fbe);border:none;border-radius:10px;color:#fff;font-size:1rem;font-weight:700;padding:14px 40px;cursor:pointer;width:100%;font-family:'Cinzel',serif;letter-spacing:0.05em;">
          BẮT ĐẦU HÀNH TRÌNH ⚔️
        </button>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#tutorial-close-btn').addEventListener('click', () => {
      localStorage.setItem('aether_tutorial_seen', '1');
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.4s';
      setTimeout(() => overlay.remove(), 400);
      if (typeof SoundSystem !== 'undefined') SoundSystem.portalEnter();
    });
  }

  init();
})();
