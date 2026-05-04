/**
 * AetherWorld RPG — Game Engine (Canvas rendering, movement, combat)
 */
const GameEngine = (function() {
  'use strict';

  // Asset paths (relative to server public/assets)
  const ASSETS = {
    player: '/assets/player.png',
    zones: {
      forest:  { bg:'/assets/zone_forest.png', boss:'/assets/boss_treant.png', vfx:'/assets/vfx_forest.png', color:'#2d6a4f' },
      volcano: { bg:'/assets/zone_volcano.png', boss:'/assets/boss_kaelthas.png', vfx:'/assets/vfx_volcano.png', color:'#ef476f' },
      ocean:   { bg:'/assets/zone_ocean.png', boss:'/assets/boss_kraken.png', vfx:'/assets/vfx_ocean.png', color:'#0077b6' },
      tower:   { bg:'/assets/zone_tower.png', boss:'/assets/boss_lich.png', vfx:'/assets/vfx_tower.png', color:'#9d4edd' },
    }
  };

  const WORLD_W = 2000, WORLD_H = 1500;
  const PLAYER_SIZE = 64, BOSS_SIZE = 180, SPEED = 4;
  const ATTACK_RANGE = 160;

  let canvas, ctx;
  let camera = { x:0, y:0 };
  let player = { x:200, y:700, facing:'right', moving:false, name:'Player' };
  let boss = { x:650, y:120, hp:0, hpMax:1, alive:false };
  let otherPlayers = {};
  let keys = new Set();
  let animFrame = null;
  let images = {};
  let currentZoneId = null;
  let isDead = false;
  let bossAttackAnim = false;

  // Callbacks
  let onMove = null;
  let onAttack = null;

  // Zone portals on world map
  const ZONE_PORTALS = [
    { id:'forest', x:400, y:350, w:120, h:120, name:'Rừng Bóng Tối', color:'#2d6a4f', emoji:'🌲', level:'Lv 50' },
    { id:'volcano', x:1400, y:300, w:120, h:120, name:'Núi Lửa Kael', color:'#ef476f', emoji:'🌋', level:'Lv 90' },
    { id:'ocean', x:400, y:1000, w:120, h:120, name:'Đại Dương Vực Thẳm', color:'#0077b6', emoji:'🌊', level:'Lv 95' },
    { id:'tower', x:1400, y:1000, w:120, h:120, name:'Tháp Phù Thủy', color:'#9d4edd', emoji:'🏰', level:'Lv 70' },
  ];
  const SAFE_ZONE = { x:800, y:600, w:200, h:200, name:'Thành Cổ Aether', color:'#06d6a0', emoji:'🏠' };

  // Preload images
  function loadImage(src) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  async function preloadAssets(serverUrl) {
    const base = serverUrl || '';
    images.player = await loadImage(base + ASSETS.player);
    for (const [zid, z] of Object.entries(ASSETS.zones)) {
      images[`bg_${zid}`] = await loadImage(base + z.bg);
      images[`boss_${zid}`] = await loadImage(base + z.boss);
      images[`vfx_${zid}`] = await loadImage(base + z.vfx);
    }
  }

  function init(canvasEl, callbacks) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    onMove = callbacks.onMove;
    onAttack = callbacks.onAttack;

    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)) { e.preventDefault(); keys.add(k); }
      if (e.code === 'Space' && !isDead && currentZoneId) {
        e.preventDefault();
        const dx = boss.x + BOSS_SIZE/2 - (player.x + PLAYER_SIZE/2);
        const dy = boss.y + BOSS_SIZE/2 - (player.y + PLAYER_SIZE/2);
        if (Math.sqrt(dx*dx+dy*dy) < ATTACK_RANGE + BOSS_SIZE/2 && boss.alive) {
          onAttack && onAttack();
        }
      }
    });
    window.addEventListener('keyup', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      keys.delete(e.key.toLowerCase());
    });
    startLoop();
  }

  function setPlayerInfo(name, hp, hpMax) { player.name = name; player.hp = hp; player.hpMax = hpMax; }
  function setPlayerPos(x, y) { player.x = x; player.y = y; }
  function setBoss(x, y, hp, hpMax) { boss.x = x; boss.y = y; boss.hp = hp; boss.hpMax = hpMax; boss.alive = hp > 0; }
  function setBossHp(hp) { boss.hp = hp; boss.alive = hp > 0; }
  function setBossPos(x, y) { boss.x = x; boss.y = y; }
  function setDead(d) { isDead = d; }
  function setBossAttackAnim(v) { bossAttackAnim = v; setTimeout(() => { bossAttackAnim = false; }, 800); }
  function setOtherPlayers(p) { otherPlayers = p; }
  function setZone(zoneId) { currentZoneId = zoneId; }
  function clearZone() { currentZoneId = null; player.x = 200; player.y = 700; }

  let activeVfxList = [];
  function triggerVfx(targetType) {
    if (!currentZoneId) return;
    const img = images[`vfx_${currentZoneId}`];
    if (!img) return;
    
    let sx = player.x + PLAYER_SIZE/2, sy = player.y + PLAYER_SIZE/2;
    let tx = boss.x + BOSS_SIZE/2, ty = boss.y + BOSS_SIZE/2;
    
    if (targetType === 'player') {
      activeVfxList.push({ startX: tx, startY: ty, x: sx, y: sy, img: img, life: 1.0, type: currentZoneId });
    } else if (targetType === 'boss_cast') {
      activeVfxList.push({ startX: tx, startY: ty, x: tx, y: ty, img: img, life: 1.0, type: currentZoneId + '_cast' });
    } else {
      activeVfxList.push({ startX: sx, startY: sy, x: tx, y: ty, img: img, life: 1.0, type: currentZoneId });
    }
  }

  let lastSent = 0;
  function updateMovement() {
    if (isDead) return;
    let moved = false;
    const wrapper = canvas.parentElement;
    const vw = wrapper ? wrapper.clientWidth : 900;
    const vh = wrapper ? wrapper.clientHeight : 500;
    const limit = currentZoneId ? { w: vw, h: vh } : { w: WORLD_W, h: WORLD_H };
    if (keys.has('a') || keys.has('arrowleft')) { player.x -= SPEED; player.facing = 'left'; moved = true; }
    if (keys.has('d') || keys.has('arrowright')) { player.x += SPEED; player.facing = 'right'; moved = true; }
    if (keys.has('w') || keys.has('arrowup')) { player.y -= SPEED; moved = true; }
    if (keys.has('s') || keys.has('arrowdown')) { player.y += SPEED; moved = true; }
    player.x = Math.max(0, Math.min(limit.w - PLAYER_SIZE, player.x));
    player.y = Math.max(0, Math.min(limit.h - PLAYER_SIZE, player.y));
    player.moving = moved;

    if (moved) {
      const now = Date.now();
      if (now - lastSent > 80) { onMove && onMove(player.x, player.y); lastSent = now; }
    }
  }

  function updateCamera() {
    const wrapper = canvas.parentElement;
    const vw = wrapper ? wrapper.clientWidth : 900;
    const vh = wrapper ? wrapper.clientHeight : 500;
    const limit = currentZoneId ? { w: vw, h: vh } : { w: WORLD_W, h: WORLD_H };
    camera.x = Math.max(0, Math.min(limit.w - vw, player.x + PLAYER_SIZE/2 - vw/2));
    camera.y = Math.max(0, Math.min(limit.h - vh, player.y + PLAYER_SIZE/2 - vh/2));
  }

  function resizeCanvas() {
    const wrapper = canvas.parentElement; if (!wrapper) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = wrapper.clientWidth * dpr;
    canvas.height = wrapper.clientHeight * dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  // ====== RENDER: WORLD MAP ======
  function renderWorldMap(vw, vh) {
    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // Background
    ctx.fillStyle = '#0a0818';
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    // Grid
    ctx.strokeStyle = 'rgba(157,78,221,0.04)'; ctx.lineWidth = 0.5;
    for (let x=0; x<WORLD_W; x+=40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,WORLD_H); ctx.stroke(); }
    for (let y=0; y<WORLD_H; y+=40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(WORLD_W,y); ctx.stroke(); }

    // Ambient glow
    const grd = ctx.createRadialGradient(WORLD_W/2,WORLD_H/2,0,WORLD_W/2,WORLD_H/2,600);
    grd.addColorStop(0,'rgba(157,78,221,0.05)'); grd.addColorStop(1,'transparent');
    ctx.fillStyle = grd; ctx.fillRect(0,0,WORLD_W,WORLD_H);

    // Paths between portals
    ctx.strokeStyle = 'rgba(157,78,221,0.08)'; ctx.lineWidth = 2; ctx.setLineDash([8,8]);
    const cx = SAFE_ZONE.x + SAFE_ZONE.w/2, cy = SAFE_ZONE.y + SAFE_ZONE.h/2;
    ZONE_PORTALS.forEach(p => {
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(p.x+p.w/2,p.y+p.h/2); ctx.stroke();
    });
    ctx.setLineDash([]);

    // Safe Zone
    drawPortal(SAFE_ZONE.x, SAFE_ZONE.y, SAFE_ZONE.w, SAFE_ZONE.h, SAFE_ZONE.color, SAFE_ZONE.emoji, SAFE_ZONE.name, '');

    // Zone portals
    ZONE_PORTALS.forEach(p => drawPortal(p.x, p.y, p.w, p.h, p.color, p.emoji, p.name, p.level));

    // Player
    drawPlayer(player.x, player.y, player.facing, player.moving, player.name, true);

    // World border
    ctx.strokeStyle = 'rgba(157,78,221,0.15)'; ctx.lineWidth = 2;
    ctx.strokeRect(0,0,WORLD_W,WORLD_H);

    ctx.restore();
  }

  function drawPortal(x, y, w, h, color, emoji, name, level) {
    // Glow circle
    const grd = ctx.createRadialGradient(x+w/2, y+h/2, 0, x+w/2, y+h/2, w*0.8);
    grd.addColorStop(0, color+'30'); grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd; ctx.fillRect(x-w/2, y-h/2, w*2, h*2);

    // Portal circle
    ctx.beginPath(); ctx.arc(x+w/2, y+h/2, w/2, 0, Math.PI*2);
    ctx.fillStyle = color+'20'; ctx.fill();
    ctx.strokeStyle = color+'80'; ctx.lineWidth = 2; ctx.stroke();

    // Emoji
    ctx.font = `${w*0.4}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.fillText(emoji, x+w/2, y+h/2);

    // Name
    ctx.font = '700 11px Cinzel,serif'; ctx.fillStyle = color;
    ctx.fillText(name, x+w/2, y+h+16);
    if (level) { ctx.font = '10px Inter,sans-serif'; ctx.fillStyle = '#8b87a0'; ctx.fillText(level, x+w/2, y+h+30); }
  }

  // ====== RENDER: COMBAT ZONE ======
  function renderCombatZone(vw, vh) {
    const zoneAsset = ASSETS.zones[currentZoneId] || ASSETS.zones.forest;
    const bgImg = images[`bg_${currentZoneId}`];
    const bossImg = images[`boss_${currentZoneId}`];
    const vfxImg = images[`vfx_${currentZoneId}`];

    // Background
    if (bgImg) { ctx.drawImage(bgImg, 0, 0, vw, vh); } else { ctx.fillStyle = '#0a0818'; ctx.fillRect(0,0,vw,vh); }
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0,0,vw,vh);

    // Calculate boss idle float (bobbing)
    const bossFloatY = boss.alive ? Math.sin(Date.now() * 0.003) * 8 : 0;
    const renderY = boss.y + bossFloatY;

    // Boss
    if (boss.alive && bossImg) {
      ctx.save();
      ctx.translate(boss.x + BOSS_SIZE/2, renderY + BOSS_SIZE/2);
      if (bossAttackAnim) { 
        ctx.filter = 'drop-shadow(0 0 30px rgba(255,0,0,1)) brightness(1.5)'; 
        ctx.scale(1.15, 1.15);
      } else { 
        ctx.filter = `drop-shadow(0 0 15px ${zoneAsset.color})`; 
      }
      ctx.drawImage(bossImg, -BOSS_SIZE/2, -BOSS_SIZE/2, BOSS_SIZE, BOSS_SIZE);
      ctx.restore();
    } else if (!boss.alive && bossImg) {
      ctx.save(); ctx.filter = 'grayscale(1) brightness(0.3)';
      ctx.drawImage(bossImg, boss.x, boss.y, BOSS_SIZE, BOSS_SIZE);
      ctx.restore();
    }

    // Transient Combat VFX
    for (let i = activeVfxList.length - 1; i >= 0; i--) {
      const v = activeVfxList[i];
      v.life -= 0.03;
      if (v.life <= 0) { activeVfxList.splice(i, 1); continue; }
      
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const p = 1 - v.life; // progress 0 to 1
      
      if (v.type.endsWith('_cast')) {
        ctx.translate(v.x, v.y);
        const s = 1.0 + p * 2.5; // Massive expanding blast
        ctx.scale(s, s);
        ctx.globalAlpha = v.life;
        ctx.rotate(p * Math.PI * 0.5);
      } else if (v.type === 'tower') {
        const curX = v.startX + (v.x - v.startX) * Math.min(p * 2, 1);
        const curY = v.startY + (v.y - v.startY) * Math.min(p * 2, 1);
        ctx.translate(curX, curY);
        ctx.scale(1, 1);
        ctx.globalAlpha = p < 0.5 ? 1 : v.life * 2;
      } else if (v.type === 'forest') {
        ctx.translate(v.x, v.y + 100 * (1 - p));
        const s = 0.5 + p * 0.8;
        ctx.scale(s, s * 1.5);
        ctx.globalAlpha = v.life;
      } else {
        ctx.translate(v.x, v.y);
        const s = 0.3 + p * 1.5;
        ctx.scale(s, s);
        if (v.type === 'ocean') ctx.rotate(p * Math.PI);
        ctx.globalAlpha = v.life;
      }
      
      ctx.drawImage(v.img, -BOSS_SIZE*0.6, -BOSS_SIZE*0.6, BOSS_SIZE*1.2, BOSS_SIZE*1.2);
      ctx.restore();
    }

    // Other players
    Object.values(otherPlayers).forEach(op => {
      drawPlayer(op.x, op.y, 'right', false, op.name, false, op.isDead);
    });

    // Player
    drawPlayer(player.x, player.y, player.facing, player.moving, player.name, true, isDead);

    // Attack range hint
    if (boss.alive && !isDead) {
      const dx = boss.x+BOSS_SIZE/2 - (player.x+PLAYER_SIZE/2);
      const dy = boss.y+BOSS_SIZE/2 - (player.y+PLAYER_SIZE/2);
      if (Math.sqrt(dx*dx+dy*dy) < ATTACK_RANGE + BOSS_SIZE/2) {
        ctx.font = '700 12px Inter,sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd166'; ctx.globalAlpha = 0.5 + 0.5*Math.sin(Date.now()*0.005);
        ctx.fillText('⚔️ SPACE tấn công!', player.x+PLAYER_SIZE/2, player.y-20);
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawPlayer(x, y, facing, moving, name, isMain, dead) {
    ctx.save();
    if (dead) ctx.filter = 'grayscale(1) brightness(0.3)';
    const pImg = images.player;
    if (pImg) {
      if (facing === 'left') { ctx.translate(x+PLAYER_SIZE, y); ctx.scale(-1,1); ctx.drawImage(pImg,0,0,PLAYER_SIZE,PLAYER_SIZE); }
      else { ctx.drawImage(pImg, x, y, PLAYER_SIZE, PLAYER_SIZE); }
    } else {
      ctx.fillStyle = isMain ? '#9d4edd' : '#06d6a0';
      ctx.fillRect(x, y, PLAYER_SIZE, PLAYER_SIZE);
    }
    ctx.restore();
    // Name tag
    ctx.font = '600 10px Inter,sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    const tw = ctx.measureText(name).width;
    ctx.fillRect(x+PLAYER_SIZE/2-tw/2-4, y-16, tw+8, 14);
    ctx.fillStyle = isMain ? '#e0aaff' : '#06d6a0';
    ctx.fillText(name, x+PLAYER_SIZE/2, y-6);
  }

  // ====== MAIN LOOP ======
  function startLoop() {
    function loop() {
      resizeCanvas();
      const vw = canvas.parentElement.clientWidth, vh = canvas.parentElement.clientHeight;
      updateMovement();
      ctx.clearRect(0, 0, vw, vh);

      if (currentZoneId) {
        renderCombatZone(vw, vh);
      } else {
        updateCamera();
        renderWorldMap(vw, vh);
      }
      animFrame = requestAnimationFrame(loop);
    }
    loop();
  }

  // Check portal collision (world map only)
  function checkPortalCollision() {
    if (currentZoneId) return null;
    const px = player.x + PLAYER_SIZE/2, py = player.y + PLAYER_SIZE/2;
    for (const p of ZONE_PORTALS) {
      if (px > p.x && px < p.x+p.w && py > p.y && py < p.y+p.h) return p.id;
    }
    return null;
  }

  return {
    init, preloadAssets, setPlayerInfo, setPlayerPos, setBoss, setBossHp, setBossPos,
    setDead, setBossAttackAnim, setOtherPlayers, setZone, clearZone, triggerVfx,
    checkPortalCollision, resizeCanvas,
    getPlayer: () => player,
    ZONE_PORTALS
  };
})();
