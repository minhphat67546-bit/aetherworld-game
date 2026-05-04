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
    npcChatHistory: []
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
    updatePlayerUI();
    $('online-count').textContent = data.onlineCount + ' Online';
    const hasToken = localStorage.getItem('aether_token');
    if (state.view === 'loading' || (state.view === 'auth' && hasToken && data.player.isLoggedIn)) {
      showView('game');
    }
    GameEngine.setPlayerInfo(data.player.name, data.player.hp, data.player.hpMax);
  });

  socket.on('online_count', c => $('online-count').textContent = c + ' Online');

  // Zone entered
  socket.on('zone_entered', data => {
    state.activeZone = data.zone; state.bossHp = data.bossHp; state.bossHpMax = data.zone.boss.hpMax;
    state.combatLogs = [{ text:`Bạn đã tiến vào ${data.zone.name}`, type:'system' }];
    state.character.hp = data.player.hp; state.character.hpMax = data.player.hpMax;

    // Build other players
    state.otherPlayers = {};
    (data.otherPlayers||[]).forEach(p => { state.otherPlayers[p.name] = p; });

    GameEngine.setZone(data.zoneId);
    GameEngine.setPlayerPos(data.player.x||150, data.player.y||300);
    GameEngine.setBoss(data.bossX||650, data.bossY||120, data.bossHp, data.zone.boss.hpMax);
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

  socket.on('force_move', data => {
    GameEngine.setPlayerPos(data.x, data.y);
  });

  socket.on('sys_msg', data => {
    addLog(`⚠️ ${data.msg}`, 'system');
    showToast(data.msg, false);
  });

  socket.on('attack_result', data => {
    state.bossHp = data.bossHp;
    GameEngine.setBossHp(data.bossHp);
    updateBossUI();
    const isMe = data.attackerName === state.character?.name;
    addLog(`${isMe?'[Bạn]':`[${data.attackerName}]`} Gây ${data.damage.toLocaleString()} sát thương ${data.isCrit?'(Chí mạng! 💥)':''}`, isMe?'player':'guild');
    GameEngine.triggerVfx('boss');
  });

  socket.on('boss_attacks_you', data => {
    state.character.hp = data.playerHp;
    updatePlayerUI();
    addLog(`[${data.bossName}] Tấn công gây ${data.damage.toLocaleString()} sát thương!`, 'boss');
    GameEngine.triggerVfx('player');
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
    if (data.loot) {
      state.lootDrop = data.loot; showLoot(data.loot);
      state.character.level = data.newLevel || (state.character.level + 1);
      state.character.gold = (state.character.gold||0) + data.loot.gold;
      state.character.inventory = [...(state.character.inventory||[]), ...data.loot.items];
      state.character.bossKills = (state.character.bossKills||0) + 1;
      updatePlayerUI(); buildInventoryGrid();
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

  // ====== UI UPDATES ======
  function updatePlayerUI() {
    const c = state.character; if (!c) return;
    $('player-name').textContent = c.name;
    $('player-class').textContent = '⚔️ ' + c.class;
    $('player-race').textContent = c.race;
    $('player-level').textContent = 'Lv ' + c.level;
    $('hp-value').textContent = `${(c.hp||0).toLocaleString()} / ${(c.hpMax||0).toLocaleString()}`;
    $('hp-fill').style.width = `${((c.hp||0)/(c.hpMax||1))*100}%`;
    $('mp-value').textContent = '12,000 / 12,000';
    $('mp-fill').style.width = '100%';
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
        slot.title = `${it.name} (${it.rarity}) - Click để sử dụng`;
        slot.addEventListener('click', () => socket.emit('use_item', { itemName: it.name }));
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
          state.npcChatHistory.push({ sender: 'Bạn', text: msg, isNpc: false });
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
    return { stats:'📊 CHỈ SỐ NHÂN VẬT', shop:'🛒 CỬA HÀNG', guilds:'👥 BANG HỘI', craft:'🔨 CHẾ TẠO', settings:'⚙️ CÀI ĐẶT', npc:'💬 TRÒ CHUYỆN NPC' }[p] || '';
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
      `;
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

  // ====== TOAST ======
  function showToast(msg, success) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast ' + (success ? 'toast--success' : 'toast--error');
    t.style.display = 'block';
    setTimeout(() => { t.style.display = 'none'; }, 3000);
  }

  // ====== INIT ======
  async function init() {
    await GameEngine.preloadAssets(SERVER);
    GameEngine.init(document.getElementById('gameCanvas'), {
      onMove: (x,y) => { if (state.activeZone) socket.emit('player_move', {x,y}); },
      onAttack: () => {
        if (!state.activeZone || state.bossHp <= 0 || state.isDead) return;
        socket.emit('attack');
      }
    });
    buildInventoryGrid();

    // Auto-connect
    const hasToken = localStorage.getItem('aether_token');
    if (hasToken) { showView('loading'); }
    socket.connect();

    new ResizeObserver(() => GameEngine.resizeCanvas()).observe(document.getElementById('gameCanvas').parentElement);
  }

  init();
})();
