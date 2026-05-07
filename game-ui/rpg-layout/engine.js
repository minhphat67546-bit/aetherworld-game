/**
 * AetherWorld RPG — Game Engine (Canvas rendering, movement, combat)
 */
const GameEngine = (function () {
  'use strict';

  // Asset paths (relative to server public/assets)
  const ASSETS = {
    player: '/assets/player.png',
    zones: {
      safezone: { color: '#2b2d42' },
      forest: { bg: '/assets/Legacy Collection/Assets/Gothicvania/Environments/mist-forest-background/mist-forest-background-preview.png', boss: '/assets/modelgame/Elementals_Crystal_Mauler_Free_v1.0/animations/PNG/idle/idle_1.png', vfx: '/assets/vfx_forest.png', color: '#2d6a4f' },
      volcano: { bg: '/assets/Legacy Collection/Assets/Gothicvania/Environments/lava-background/PNG/lava-background-preview.png', boss: '/assets/boss_kaelthas.png', vfx: '/assets/vfx_volcano.png', color: '#ef476f' },
      ocean: { bg: '/assets/Legacy Collection/Assets/Gothicvania/Environments/Underwater Fantasy/PNG/underwater-fantasy-preview.png', boss: '/assets/boss_kraken.png', vfx: '/assets/vfx_ocean.png', color: '#0077b6' },
      tower: { bg: '/assets/Legacy Collection/Assets/Gothicvania/Environments/Gothic-Castle-Files/PNG/gothic-castle-preview.png', boss: '/assets/boss_lich.png', vfx: '/assets/vfx_tower.png', color: '#9d4edd' }
    }
  };

  const WORLD_W = 2000, WORLD_H = 1500;
  const PLAYER_SIZE = 64, BOSS_SIZE = 180, SPEED = 4;
  // Attack range per race (px) — ranged classes hit from far, melee classes need to close in
  const RANGE_BY_RACE = {
    'Orc': 100,       // Tanker — cận chiến nặng
    'Light Elf': 350, // Mage — phép thuật tầm xa
    'Dark Elf': 120,  // Assassin — cận chiến nhanh
    'Dwarf': 130,     // Bruiser — cận chiến vừa
    'Human': 300      // Wizard — phép thuật tầm xa
  };
  function getAttackRange() { return RANGE_BY_RACE[playerRace] || 160; }
  const DEBUG_MODE = false;

  let canvas, ctx;
  let camera = { x: 0, y: 0 };
  let player = { x: 200, y: 300, vx: 0, vy: 0, onGround: false, facing: 'right', moving: false, name: 'Player', drawOffsetX: 0, drawOffsetY: 16 };

  // ── Attack Animation Sync ──
  const ATTACK_ANIM_DURATION = 500; // ms — total attack animation time
  const ATTACK_IMPACT_PCT = 0.55;    // impact happens at 55% of animation
  let attackStartTime = 0;           // timestamp when current attack started
  let pendingDamageQueue = [];       // queued damage results waiting for impact frame

  // ── Simple Physics (combat zones only) ──
  const PHYSICS = {
    gravity: 0.7,
    jumpForce: -15,
    maxFall: 18,
    accel: 1.5,
    friction: 0.82,
    maxSpeed: 7,
    // Sàn ẩn cách mép dưới màn hình bao nhiêu px (điều chỉnh cho khớp với background)
    floorOffset: 160
  };
  let boss = { x: 650, y: 120, hp: 0, hpMax: 1, alive: false, drawOffsetX: 0, drawOffsetY: -20 };
  let otherPlayers = {};
  let mobs = [];
  let keys = new Set();
  let animFrame = null;
  let images = {};
  let currentZoneId = null;
  let isDead = false;
  let bossAttackAnim = false;
  let playerAttackAnim = false;
  let damageTexts = [];

  const bloodParticles = [];

  function spawnBlood(x, y, isCrit) {
    const count = isCrit ? 15 : 8;
    for (let i = 0; i < count; i++) {
      bloodParticles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.8) * 8,
        life: 1.0,
        size: Math.random() * 4 + 2
      });
    }
  }

  function renderBloodParticles() {
    for (let i = bloodParticles.length - 1; i >= 0; i--) {
      const p = bloodParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.5; // gravity
      p.life -= 0.03;

      if (p.life <= 0) {
        bloodParticles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }


  // Player race for sprite selection (set by main.js after init)
  let playerRace = 'Human';
  function setPlayerRace(race) { playerRace = race; }

  // Dodge roll
  let dodgeState = { active: false, dx: 0, dy: 0, timer: 0, cooldown: 0 };
  const DODGE_SPEED = 14, DODGE_FRAMES = 14, DODGE_COOLDOWN_MS = 2500;
  let dodgeTrail = [];

  // Virtual input (mobile / external)
  let virtualInput = { x: 0, y: 0, attack: false, dodge: false };
  function setVirtualInput(v) { virtualInput = v; }
  function triggerVirtualDodge() { _startDodge(); }

  // Callbacks
  let onMove = null;
  let onAttack = null;

  function getNearestMob() {
    let nearest = null;
    let minDist = Infinity;
    mobs.forEach(m => {
      if (m.isDead) return;
      const dx = m.x - player.x;
      const dy = m.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const mobRange = getAttackRange();
      if (dist < mobRange && dist < minDist) {
        minDist = dist;
        nearest = m;
      }
    });
    return nearest;
  }

  // Floating Combat Text
  function createDamageText(damage, x, y, isCrit = false, isEnemy = false) {
    damageTexts.push({
      text: `-${damage.toLocaleString()}`,
      x: x + (Math.random() * 40 - 20),
      y: y,
      alpha: 1.0,
      life: 0,
      maxLife: 60,
      isCrit: isCrit,
      isEnemy: isEnemy
    });
  }

  function renderDamageTexts() {
    for (let i = damageTexts.length - 1; i >= 0; i--) {
      const dmgTxt = damageTexts[i];
      dmgTxt.y -= 1.5;
      dmgTxt.life++;
      if (dmgTxt.life > dmgTxt.maxLife * 0.7) {
        dmgTxt.alpha -= 0.05;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, dmgTxt.alpha);
      ctx.font = dmgTxt.isCrit ? "bold 24px Arial" : "bold 18px Arial";
      if (dmgTxt.isEnemy) {
        ctx.fillStyle = "#ff3333";
      } else {
        ctx.fillStyle = dmgTxt.isCrit ? "#ffcc00" : "#ffffff";
      }

      ctx.strokeStyle = "black";
      ctx.lineWidth = 3;
      ctx.strokeText(dmgTxt.text, dmgTxt.x, dmgTxt.y);
      ctx.fillText(dmgTxt.text, dmgTxt.x, dmgTxt.y);
      ctx.restore();

      if (dmgTxt.life >= dmgTxt.maxLife) {
        damageTexts.splice(i, 1);
      }
    }
  }

  // Zone portals on world map
  const ZONE_PORTALS = [
    { id: 'forest', x: 400, y: 350, w: 120, h: 120, name: 'Rừng Bóng Tối', color: '#2d6a4f', emoji: '🌲', level: 'Lv 50' },
    { id: 'volcano', x: 1400, y: 300, w: 120, h: 120, name: 'Núi Lửa Kael', color: '#ef476f', emoji: '🌋', level: 'Lv 90' },
    { id: 'ocean', x: 400, y: 1000, w: 120, h: 120, name: 'Đại Dương Vực Thẳm', color: '#0077b6', emoji: '🌊', level: 'Lv 95' },
    { id: 'tower', x: 1400, y: 1000, w: 120, h: 120, name: 'Tháp Phù Thủy', color: '#9d4edd', emoji: '🏰', level: 'Lv 70' },
  ];
  const SAFE_ZONE = { x: 800, y: 600, w: 200, h: 200, name: 'Thành Cổ Aether', color: '#06d6a0', emoji: '🏠' };

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
      if (Array.isArray(z.bg)) {
        images[`bg_${zid}`] = await Promise.all(z.bg.map(src => loadImage(base + src)));
      } else if (z.bg) {
        images[`bg_${zid}`] = await loadImage(base + z.bg);
      }
      images[`boss_${zid}`] = await loadImage(base + z.boss);
      images[`vfx_${zid}`] = await loadImage(base + z.vfx);
    }
    // Preload luizmelo GIF sprites (CC0)
    if (typeof SpriteSystem !== 'undefined') {
      SpriteSystem.preloadAll();
    }
  }

  function init(canvasEl, callbacks) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    onMove = callbacks.onMove;
    onAttack = callbacks.onAttack;

    // Preload sprites
    if (typeof SpriteSystem !== 'undefined') {
      SpriteSystem.preloadAll();
    }

    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { e.preventDefault(); keys.add(k); }

      // --- CHỈNH TAY LIVE (LIVE TWEAK) KHI BẬT DEBUG_MODE ---
      if (typeof DEBUG_MODE !== 'undefined' && DEBUG_MODE) {
        if (k === 'i') { boss.drawOffsetY -= 1; console.log(`[Boss] Offset Y: ${boss.drawOffsetY}`); }
        if (k === 'k') { boss.drawOffsetY += 1; console.log(`[Boss] Offset Y: ${boss.drawOffsetY}`); }
        if (k === 'j') { boss.drawOffsetX -= 1; console.log(`[Boss] Offset X: ${boss.drawOffsetX}`); }
        if (k === 'l') { boss.drawOffsetX += 1; console.log(`[Boss] Offset X: ${boss.drawOffsetX}`); }

        if (k === 't') { player.drawOffsetY -= 1; console.log(`[Player] Offset Y: ${player.drawOffsetY}`); }
        if (k === 'g') { player.drawOffsetY += 1; console.log(`[Player] Offset Y: ${player.drawOffsetY}`); }
        if (k === 'f') { player.drawOffsetX -= 1; console.log(`[Player] Offset X: ${player.drawOffsetX}`); }
        if (k === 'h') { player.drawOffsetX += 1; console.log(`[Player] Offset X: ${player.drawOffsetX}`); }
      }

      if (e.code === 'Space' && !isDead && currentZoneId) {
        e.preventDefault();
        const bossDx = boss.x + BOSS_SIZE / 2 - (player.x + PLAYER_SIZE / 2);
        const bossDy = boss.y + BOSS_SIZE / 2 - (player.y + PLAYER_SIZE / 2);
        const mob = getNearestMob();
        const currentRange = getAttackRange();
        if ((Math.sqrt(bossDx * bossDx + bossDy * bossDy) < currentRange + BOSS_SIZE / 2 && boss.alive) || mob) {
          // onAttack returns true if attack went through, false if on cooldown
          const attackFired = onAttack && onAttack(mob ? mob.id : null);
          if (attackFired) {
            playerAttackAnim = true;
            attackStartTime = Date.now();
            setTimeout(() => playerAttackAnim = false, ATTACK_ANIM_DURATION);
            // Fire player VFX at impact moment (55% of animation)
            setTimeout(() => {
              if (mob) {
                triggerPlayerAttackVfx(mob.x + 28, mob.y + 28);
              } else {
                triggerPlayerAttackVfx(boss.x + BOSS_SIZE / 2, boss.y + BOSS_SIZE / 2);
              }
            }, ATTACK_ANIM_DURATION * ATTACK_IMPACT_PCT);
          }
        }
      }
      // Shift / double-tap dodge
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        e.preventDefault();
        _startDodge();
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
  function setBossPos(x, y) {
    if (boss.x !== x || boss.y !== y) {
      boss.moving = true;
      clearTimeout(boss.moveTimeout);
      boss.moveTimeout = setTimeout(() => { boss.moving = false; }, 800);
    }
    boss.x = x;
    boss.y = y;
  }
  function setDead(d) { isDead = d; }
  function setBossAttackAnim(v) { bossAttackAnim = v; setTimeout(() => { bossAttackAnim = false; }, 800); }
  function setOtherPlayers(p) { otherPlayers = p; }
  function setMobs(m) { mobs = m; }
  function setZone(zoneId) { currentZoneId = zoneId; }
  function clearZone() { currentZoneId = null; player.x = 200; player.y = 700; }

  let activeVfxList = [];
  function triggerVfx(targetType) {
    if (!currentZoneId) return;
    const img = images[`vfx_${currentZoneId}`];
    if (!img) return;

    let sx = player.x + PLAYER_SIZE / 2, sy = player.y + PLAYER_SIZE / 2;
    let tx = boss.x + BOSS_SIZE / 2, ty = boss.y + BOSS_SIZE / 2;

    if (targetType === 'player') {
      activeVfxList.push({ startX: tx, startY: ty, x: sx, y: sy, img: img, life: 1.0, type: currentZoneId });
    } else if (targetType === 'boss_cast') {
      activeVfxList.push({ startX: tx, startY: ty, x: tx, y: ty, img: img, life: 1.0, type: currentZoneId + '_cast' });
    } else {
      activeVfxList.push({ startX: sx, startY: sy, x: tx, y: ty, img: img, life: 1.0, type: currentZoneId });
    }
  }

  // ── Player attack VFX (mage bolt, etc.) ──────────────────────────────────
  let playerVfxList = [];
  function triggerPlayerAttackVfx(targetX, targetY) {
    const sx = player.x + PLAYER_SIZE / 2;
    const sy = player.y + PLAYER_SIZE / 2;
    playerVfxList.push({
      startX: sx, startY: sy,
      tx: targetX, ty: targetY,
      life: 1.0,
      race: playerRace
    });
  }

  function renderPlayerVfx(ctx) {
    for (let i = playerVfxList.length - 1; i >= 0; i--) {
      const v = playerVfxList[i];
      v.life -= 0.045;
      if (v.life <= 0) { playerVfxList.splice(i, 1); continue; }
      const p = 1 - v.life; // 0→1 progress

      if (v.race === 'Human') {
        // Purple arcane bolt travelling from player to target
        const curX = v.startX + (v.tx - v.startX) * Math.min(p * 1.8, 1);
        const curY = v.startY + (v.ty - v.startY) * Math.min(p * 1.8, 1);

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        // Outer glow
        const grad = ctx.createRadialGradient(curX, curY, 0, curX, curY, 28);
        grad.addColorStop(0, `rgba(220,130,255,${v.life})`);
        grad.addColorStop(0.4, `rgba(157,78,221,${v.life * 0.7})`);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(curX, curY, 28, 0, Math.PI * 2);
        ctx.fill();
        // Inner bright core
        ctx.fillStyle = `rgba(255,220,255,${v.life})`;
        ctx.beginPath();
        ctx.arc(curX, curY, 7, 0, Math.PI * 2);
        ctx.fill();
        // Trailing sparkles
        for (let s = 0; s < 4; s++) {
          const trailP = Math.max(0, p - s * 0.06);
          const tx2 = v.startX + (v.tx - v.startX) * Math.min(trailP * 1.8, 1);
          const ty2 = v.startY + (v.ty - v.startY) * Math.min(trailP * 1.8, 1);
          ctx.globalAlpha = v.life * (1 - s * 0.22);
          ctx.fillStyle = 'rgba(200,100,255,0.5)';
          ctx.beginPath();
          ctx.arc(tx2, ty2, 5 - s, 0, Math.PI * 2);
          ctx.fill();
        }
        // Impact burst at end
        if (p > 0.7) {
          const bAlpha = (p - 0.7) / 0.3 * v.life;
          const bScale = (p - 0.7) / 0.3;
          const bg = ctx.createRadialGradient(v.tx, v.ty, 0, v.tx, v.ty, 50 * bScale);
          bg.addColorStop(0, `rgba(255,200,255,${bAlpha})`);
          bg.addColorStop(1, 'transparent');
          ctx.globalAlpha = 1;
          ctx.fillStyle = bg;
          ctx.beginPath();
          ctx.arc(v.tx, v.ty, 50 * bScale, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

      } else {
        // Generic white slash arc for melee classes
        const angle = Math.atan2(v.ty - v.startY, v.tx - v.startX);
        const cx2 = v.tx, cy2 = v.ty;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = v.life * 0.85;
        ctx.strokeStyle = `rgba(255,255,200,${v.life})`;
        ctx.lineWidth = 4 - p * 3;
        ctx.beginPath();
        ctx.arc(cx2, cy2, 20 + p * 15, angle - 0.9, angle + 0.9);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  let lastSent = 0;

  function _startDodge() {
    if (dodgeState.active || isDead) return;
    const now = Date.now();
    if (now - dodgeState.cooldown < DODGE_COOLDOWN_MS) return;
    // Direction from current key inputs
    let dx = 0, dy = 0;
    if (keys.has('a') || keys.has('arrowleft') || virtualInput.x < -0.3) dx = -1;
    if (keys.has('d') || keys.has('arrowright') || virtualInput.x > 0.3) dx = 1;
    if (keys.has('w') || keys.has('arrowup') || virtualInput.y < -0.3) dy = -1;
    if (keys.has('s') || keys.has('arrowdown') || virtualInput.y > 0.3) dy = 1;
    if (dx === 0 && dy === 0) dx = player.facing === 'right' ? 1 : -1;
    const len = Math.sqrt(dx * dx + dy * dy);
    dodgeState = { active: true, dx: dx / len, dy: dy / len, timer: DODGE_FRAMES, cooldown: now };
    if (typeof SoundSystem !== 'undefined') SoundSystem.dodge();
  }

  function updateMovement() {
    if (isDead) return;
    const wrapper = canvas.parentElement;
    const vw = wrapper ? wrapper.clientWidth : 900;
    const vh = wrapper ? wrapper.clientHeight : 500;
    const limit = currentZoneId ? { w: vw, h: vh } : { w: WORLD_W, h: WORLD_H };

    // Dodge roll takes over movement
    if (dodgeState.active) {
      player.x += dodgeState.dx * DODGE_SPEED;
      player.y += dodgeState.dy * DODGE_SPEED;
      dodgeTrail.push({ x: player.x + PLAYER_SIZE / 2, y: player.y + PLAYER_SIZE / 2, life: 1.0 });
      dodgeState.timer--;
      if (dodgeState.timer <= 0) dodgeState.active = false;
      player.x = Math.max(0, Math.min(limit.w - PLAYER_SIZE, player.x));
      player.y = Math.max(0, Math.min(limit.h - PLAYER_SIZE, player.y));
      player.moving = true;
      const now = Date.now();
      if (now - lastSent > 80) { onMove && onMove(player.x, player.y); lastSent = now; }
      return;
    }

    let moved = false;
    const vxInput = virtualInput.x || 0;
    const vyInput = virtualInput.y || 0;

    if (!currentZoneId) {
      // ── WORLD MAP: top-down 4 hướng ──
      if (keys.has('a') || keys.has('arrowleft') || vxInput < -0.3) { player.x -= SPEED; player.facing = 'left'; moved = true; }
      if (keys.has('d') || keys.has('arrowright') || vxInput > 0.3) { player.x += SPEED; player.facing = 'right'; moved = true; }
      if (keys.has('w') || keys.has('arrowup') || vyInput < -0.3) { player.y -= SPEED; moved = true; }
      if (keys.has('s') || keys.has('arrowdown') || vyInput > 0.3) { player.y += SPEED; moved = true; }
      player.x = Math.max(0, Math.min(limit.w - PLAYER_SIZE, player.x));
      player.y = Math.max(0, Math.min(limit.h - PLAYER_SIZE, player.y));
      player.moving = moved;
    } else {
      // ── COMBAT ZONE: vật lý 2D (trái/phải + nhảy + trọng lực) ──
      const FLOOR_Y = vh - PHYSICS.floorOffset; // Sàn ẩn

      // Ngang
      if (keys.has('a') || keys.has('arrowleft') || vxInput < -0.3) { player.vx -= PHYSICS.accel; player.facing = 'left'; moved = true; }
      else if (keys.has('d') || keys.has('arrowright') || vxInput > 0.3) { player.vx += PHYSICS.accel; player.facing = 'right'; moved = true; }
      else { player.vx *= PHYSICS.friction; }
      player.vx = Math.max(-PHYSICS.maxSpeed, Math.min(PHYSICS.maxSpeed, player.vx));
      if (Math.abs(player.vx) < 0.2) player.vx = 0;

      // Nhảy (W / ArrowUp / Space)
      const wantJump = keys.has('w') || keys.has('arrowup') || keys.has(' ') || vyInput < -0.5;
      if (wantJump && player.onGround) {
        player.vy = PHYSICS.jumpForce;
        player.onGround = false;
      }

      // Trọng lực
      player.vy += PHYSICS.gravity;
      if (player.vy > PHYSICS.maxFall) player.vy = PHYSICS.maxFall;

      // Áp dụng vận tốc
      player.x += player.vx;
      player.y += player.vy;

      // Va chạm sàn ẩn
      if (player.y + PLAYER_SIZE >= FLOOR_Y) {
        player.y = FLOOR_Y - PLAYER_SIZE;
        player.vy = 0;
        player.onGround = true;
      } else {
        player.onGround = false;
      }

      // Giới hạn trái/phải
      if (player.x < 0) { player.x = 0; player.vx = 0; }
      if (player.x > limit.w - PLAYER_SIZE) { player.x = limit.w - PLAYER_SIZE; player.vx = 0; }

      player.moving = moved || Math.abs(player.vx) > 0.5 || !player.onGround;
    }

    if (moved || player.vx !== 0 || player.vy !== 0) {
      const now = Date.now();
      if (now - lastSent > 80) { onMove && onMove(player.x, player.y); lastSent = now; }
    }
  }

  function updateCamera() {
    const wrapper = canvas.parentElement;
    const vw = wrapper ? wrapper.clientWidth : 900;
    const vh = wrapper ? wrapper.clientHeight : 500;
    const limit = currentZoneId ? { w: vw, h: vh } : { w: WORLD_W, h: WORLD_H };
    camera.x = Math.max(0, Math.min(limit.w - vw, player.x + PLAYER_SIZE / 2 - vw / 2));
    camera.y = Math.max(0, Math.min(limit.h - vh, player.y + PLAYER_SIZE / 2 - vh / 2));
  }

  function resizeCanvas() {
    const wrapper = canvas.parentElement; if (!wrapper) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = wrapper.clientWidth * dpr;
    canvas.height = wrapper.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false; // preserve sharp pixels
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
    for (let x = 0; x < WORLD_W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_H); ctx.stroke(); }
    for (let y = 0; y < WORLD_H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD_W, y); ctx.stroke(); }

    // Ambient glow
    const grd = ctx.createRadialGradient(WORLD_W / 2, WORLD_H / 2, 0, WORLD_W / 2, WORLD_H / 2, 600);
    grd.addColorStop(0, 'rgba(157,78,221,0.05)'); grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    // Paths between portals
    ctx.strokeStyle = 'rgba(157,78,221,0.08)'; ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
    const cx = SAFE_ZONE.x + SAFE_ZONE.w / 2, cy = SAFE_ZONE.y + SAFE_ZONE.h / 2;
    ZONE_PORTALS.forEach(p => {
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p.x + p.w / 2, p.y + p.h / 2); ctx.stroke();
    });
    ctx.setLineDash([]);

    // Safe Zone
    drawPortal(SAFE_ZONE.x, SAFE_ZONE.y, SAFE_ZONE.w, SAFE_ZONE.h, SAFE_ZONE.color, SAFE_ZONE.emoji, SAFE_ZONE.name, '');

    // Zone portals
    ZONE_PORTALS.forEach(p => drawPortal(p.x, p.y, p.w, p.h, p.color, p.emoji, p.name, p.level));

    // Player — world map (account for camera offset in canvas translate)
    drawPlayer(player.x + player.drawOffsetX, player.y + player.drawOffsetY, player.facing, player.moving, player.name, true, isDead, null, playerAttackAnim);


    // World border
    ctx.strokeStyle = 'rgba(157,78,221,0.15)'; ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, WORLD_W, WORLD_H);

    ctx.restore();
  }

  function drawPortal(x, y, w, h, color, emoji, name, level) {
    // Glow circle
    const grd = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, w * 0.8);
    grd.addColorStop(0, color + '30'); grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd; ctx.fillRect(x - w / 2, y - h / 2, w * 2, h * 2);

    // Portal circle
    ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2);
    ctx.fillStyle = color + '20'; ctx.fill();
    ctx.strokeStyle = color + '80'; ctx.lineWidth = 2; ctx.stroke();

    // Emoji
    ctx.font = `${w * 0.4}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.fillText(emoji, x + w / 2, y + h / 2);

    // Name
    ctx.font = '700 11px Cinzel,serif'; ctx.fillStyle = color;
    ctx.fillText(name, x + w / 2, y + h + 16);
    if (level) { ctx.font = '10px Inter,sans-serif'; ctx.fillStyle = '#8b87a0'; ctx.fillText(level, x + w / 2, y + h + 30); }
  }

  // ====== RENDER: COMBAT ZONE ======
  function renderCombatZone(vw, vh) {
    const zoneAsset = ASSETS.zones[currentZoneId] || ASSETS.zones.forest;
    const bgImg = images[`bg_${currentZoneId}`];
    const vfxImg = images[`vfx_${currentZoneId}`];

    // Background
    if (Array.isArray(bgImg)) {
      ctx.fillStyle = zoneAsset.color || '#87CEEB'; // Sky blue default
      ctx.fillRect(0, 0, vw, vh);

      bgImg.forEach((img, idx) => {
        if (img) {
          // slight parallax effect based on player X position
          const offsetX = (player.x / 50) * idx;
          // Shift the background up by 100px and stretch it slightly to make the ground appear higher
          ctx.drawImage(img, -offsetX, -100, vw + offsetX + 20, vh + 100);
        }
      });
    } else if (bgImg) {
      ctx.drawImage(bgImg, 0, -100, vw, vh + 100);
    } else {
      // PROCEDURAL BACKGROUND (For Safezone / Fallback)
      const t = Date.now() / 2000;

      // Sky gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, vh);
      skyGrad.addColorStop(0, '#1a1b41'); // Dark night sky
      skyGrad.addColorStop(0.6, '#292a5d');
      skyGrad.addColorStop(1, '#4a4e69'); // Sunset/twilight horizon
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, vw, vh);

      // Twinkling stars
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 80; i++) {
        const sx = (Math.sin(i * 13.5) * 0.5 + 0.5) * vw;
        const sy = (Math.cos(i * 7.1) * 0.5 + 0.5) * vh * 0.6; // stars only in upper 60%
        const alpha = (Math.sin(t * 2 + i) * 0.4 + 0.6) * 0.7; // twinkle
        ctx.globalAlpha = alpha;
        ctx.beginPath(); ctx.arc(sx, sy, Math.random() > 0.5 ? 1 : 1.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1.0;

      // Parallax Moon
      const moonX = vw * 0.8 - (player.x * 0.05);
      ctx.beginPath();
      ctx.arc(moonX, vh * 0.25, 60, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd166';
      ctx.shadowColor = '#ffd166';
      ctx.shadowBlur = 50;
      ctx.fill();
      ctx.shadowBlur = 0; // reset

      // Castle / Mountain Silhouettes (Parallax)
      ctx.fillStyle = '#22223b';
      ctx.beginPath();
      ctx.moveTo(0, vh);
      for (let i = 0; i <= vw + 100; i += 40) {
        const px = i - (player.x * 0.1) % 40;
        ctx.lineTo(px, vh * 0.65 + Math.sin(px * 0.005) * 40 + Math.cos(px * 0.02) * 15);
      }
      ctx.lineTo(vw, vh);
      ctx.fill();

      // Smooth Ground
      const groundGrad = ctx.createLinearGradient(0, vh * 0.8, 0, vh);
      groundGrad.addColorStop(0, '#111120');
      groundGrad.addColorStop(1, '#050510');
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, vh * 0.8, vw, vh * 0.2);

      // Grid lines on ground for perspective
      ctx.strokeStyle = 'rgba(157, 78, 221, 0.15)';
      ctx.lineWidth = 1;
      for (let i = 0; i < vw; i += 60) {
        ctx.beginPath();
        const startX = i - (player.x % 60);
        ctx.moveTo(startX, vh * 0.8);
        ctx.lineTo(startX + (startX - vw / 2) * 0.5, vh);
        ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, vw, vh);

    // Snap boss to invisible floor
    const FLOOR_Y = vh - PHYSICS.floorOffset;
    const renderY = FLOOR_Y - BOSS_SIZE;

    if (DEBUG_MODE) {
      ctx.save();
      ctx.strokeStyle = '#FF0000';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, FLOOR_Y, vw, PHYSICS.floorOffset);
      ctx.restore();
    }


    // Boss — procedural sprite via SpriteSystem
    if (zoneAsset.boss) {
      if (typeof SpriteSystem !== 'undefined') {
        SpriteSystem.drawBoss(ctx, boss.x + boss.drawOffsetX, renderY + boss.drawOffsetY, BOSS_SIZE, currentZoneId, bossAttackAnim, !boss.alive, player.x, boss.moving);
      } else {
        // Legacy fallback
        const bossImg = images[`boss_${currentZoneId}`];
        if (boss.alive && bossImg) {
          ctx.save();
          ctx.translate((boss.x + boss.drawOffsetX) + BOSS_SIZE / 2, (renderY + boss.drawOffsetY) + BOSS_SIZE / 2);
          ctx.filter = `drop-shadow(0 0 15px ${zoneAsset.color})`;
          ctx.drawImage(bossImg, -BOSS_SIZE / 2, -BOSS_SIZE / 2, BOSS_SIZE, BOSS_SIZE);
          ctx.restore();
        } else if (!boss.alive) {
          ctx.save(); ctx.fillStyle = 'rgba(100,100,100,0.3)';
          ctx.fillRect(boss.x + boss.drawOffsetX, boss.y + boss.drawOffsetY, BOSS_SIZE, BOSS_SIZE);
          ctx.restore();
        }
      }

      if (DEBUG_MODE && boss.alive) {
        ctx.save();
        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = 1;
        ctx.strokeRect(boss.x, renderY, BOSS_SIZE, BOSS_SIZE);
        ctx.restore();
      }
    }

    // Transient Combat VFX
    for (let i = activeVfxList.length - 1; i >= 0; i--) {
      const v = activeVfxList[i];
      v.life -= 0.03;
      if (v.life <= 0) { activeVfxList.splice(i, 1); continue; }

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const p = 1 - v.life; // progress 0 to 1

      let renderX = v.x;
      let renderY = v.y;

      if (v.type === 'tower') {
        renderX = v.startX + (v.x - v.startX) * Math.min(p * 2, 1);
        renderY = v.startY + (v.y - v.startY) * Math.min(p * 2, 1);
      } else if (v.type === 'forest') {
        renderY = v.y + 100 * (1 - p);
      }

      let handled = false;
      if (typeof SpriteSystem !== 'undefined' && SpriteSystem.drawAnimatedVfx) {
          handled = SpriteSystem.drawAnimatedVfx(ctx, renderX, renderY, BOSS_SIZE, v.type, p, player.x, boss.x);
      }

      if (!handled) {
          if (v.type.endsWith('_cast')) {
            ctx.translate(renderX, renderY);
            const s = 1.0 + p * 2.5; // Massive expanding blast
            ctx.scale(s, s);
            ctx.globalAlpha = v.life;
            ctx.rotate(p * Math.PI * 0.5);
          } else if (v.type === 'tower') {
            ctx.translate(renderX, renderY);
            ctx.scale(1, 1);
            ctx.globalAlpha = p < 0.5 ? 1 : v.life * 2;
          } else if (v.type === 'forest') {
            ctx.translate(renderX, renderY);
            const s = 0.5 + p * 0.8;
            ctx.scale(s, s * 1.5);
            ctx.globalAlpha = v.life;
          } else {
            ctx.translate(renderX, renderY);
            const s = 0.3 + p * 1.5;
            ctx.scale(s, s);
            if (v.type === 'ocean') ctx.rotate(p * Math.PI);
            ctx.globalAlpha = v.life;
          }
          ctx.drawImage(v.img, -BOSS_SIZE * 0.6, -BOSS_SIZE * 0.6, BOSS_SIZE * 1.2, BOSS_SIZE * 1.2);
      }
      ctx.restore();
    }

    // Player attack VFX
    renderPlayerVfx(ctx);

    // Mobs — procedural sprites via SpriteSystem
    mobs.forEach((m, idx) => {
      if (m.isDead) return;
      const MOB_DRAW_SIZE = 56;
      const floatY = Math.sin(Date.now() * 0.005 + m.id.charCodeAt(m.id.length - 1)) * 5;
      const drawX = m.x;
      // Snap mob to invisible floor
      const drawY = FLOOR_Y - MOB_DRAW_SIZE + floatY;

      const mobOffsetX = m.drawOffsetX !== undefined ? m.drawOffsetX : 0;
      const mobOffsetY = m.drawOffsetY !== undefined ? m.drawOffsetY : -20;

      if (typeof SpriteSystem !== 'undefined') {
        SpriteSystem.drawMob(ctx, drawX + mobOffsetX, drawY + mobOffsetY, MOB_DRAW_SIZE, idx, false, currentZoneId, player.x);
      } else {
        ctx.save();
        ctx.fillStyle = 'rgba(255,60,60,0.8)';
        ctx.beginPath(); ctx.arc((drawX + mobOffsetX) + 28, (drawY + mobOffsetY) + 28, 20, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // HP Bar
      ctx.save();
      ctx.fillStyle = '#000'; ctx.fillRect((drawX + mobOffsetX) - 1, (drawY + mobOffsetY) - 12, 58, 7);
      ctx.fillStyle = '#ff4d4d'; ctx.fillRect(drawX + mobOffsetX, (drawY + mobOffsetY) - 11, 56 * (m.hp / m.hpMax), 5);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
      ctx.strokeRect((drawX + mobOffsetX) - 1, (drawY + mobOffsetY) - 12, 58, 7);
      ctx.font = '700 11px Inter,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`Lv.${m.level} ${m.name}`, (drawX + mobOffsetX) + 28, (drawY + mobOffsetY) - 16);
      ctx.restore();

      if (DEBUG_MODE) {
        ctx.save();
        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = 1;
        ctx.strokeRect(drawX, drawY, MOB_DRAW_SIZE, MOB_DRAW_SIZE);
        ctx.restore();
      }
    });

    // Other players
    Object.values(otherPlayers).forEach(op => {
      const opOffsetX = op.drawOffsetX !== undefined ? op.drawOffsetX : 0;
      const opOffsetY = op.drawOffsetY !== undefined ? op.drawOffsetY : -20;
      drawPlayer(op.x + opOffsetX, op.y + opOffsetY, 'right', false, op.name, false, op.isDead, null, op.isAttacking);

      if (DEBUG_MODE) {
        ctx.save();
        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = 1;
        ctx.strokeRect(op.x, op.y, PLAYER_SIZE, PLAYER_SIZE);
        ctx.restore();
      }
    });

    // Dodge trail
    for (let i = dodgeTrail.length - 1; i >= 0; i--) {
      const t = dodgeTrail[i];
      t.life -= 0.12;
      if (t.life <= 0) { dodgeTrail.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = t.life * 0.4;
      ctx.fillStyle = '#9d4edd';
      ctx.beginPath();
      ctx.arc(t.x, t.y, 16 * t.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Player
    ctx.save();
    if (dodgeState.active) { ctx.globalAlpha = 0.6; }
    drawPlayer(player.x + player.drawOffsetX, player.y + player.drawOffsetY, player.facing, player.moving, player.name, true, isDead, null, playerAttackAnim);
    ctx.restore();

    if (DEBUG_MODE) {
      ctx.save();
      ctx.strokeStyle = '#FF0000';
      ctx.lineWidth = 1;
      ctx.strokeRect(player.x, player.y, PLAYER_SIZE, PLAYER_SIZE);
      ctx.restore();
    }

    // Attack range hint
    if (zoneAsset.boss && boss.alive && !isDead) {
      const dx = boss.x + BOSS_SIZE / 2 - (player.x + PLAYER_SIZE / 2);
      const dy = boss.y + BOSS_SIZE / 2 - (player.y + PLAYER_SIZE / 2);
      if (Math.sqrt(dx * dx + dy * dy) < getAttackRange() + BOSS_SIZE / 2) {
        ctx.font = '700 12px Inter,sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd166'; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(Date.now() * 0.005);
        ctx.fillText('⚔️ SPACE tấn công!', player.x + PLAYER_SIZE / 2, player.y - 20);
        ctx.globalAlpha = 1;
      }
    }

    // Process queued damage at impact frame
    processPendingDamage();
    renderDamageTexts();
    renderBloodParticles();
  }

  function drawPlayer(x, y, facing, moving, name, isMain, dead, raceOverride, attacking) {
    const race = raceOverride || (isMain ? playerRace : 'Human');

    if (typeof SpriteSystem !== 'undefined') {
      SpriteSystem.drawPlayer(ctx, x, y, PLAYER_SIZE, race, facing, dead, moving, attacking);
    } else {
      ctx.save();
      if (dead) ctx.filter = 'grayscale(1) brightness(0.3)';
      ctx.fillStyle = isMain ? '#9d4edd' : '#06d6a0';
      ctx.fillRect(x, y, PLAYER_SIZE, PLAYER_SIZE);
      ctx.restore();
    }

    // Name tag
    ctx.font = '600 10px Inter,sans-serif'; ctx.textAlign = 'center';
    const tw = ctx.measureText(name).width;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(x + PLAYER_SIZE / 2 - tw / 2 - 5, y - 18, tw + 10, 15);
    ctx.fillStyle = isMain ? '#e0aaff' : '#06d6a0';
    ctx.fillText(name, x + PLAYER_SIZE / 2, y - 7);
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
    const px = player.x + PLAYER_SIZE / 2, py = player.y + PLAYER_SIZE / 2;
    for (const p of ZONE_PORTALS) {
      if (px > p.x && px < p.x + p.w && py > p.y && py < p.y + p.h) return p.id;
    }
    const sz = SAFE_ZONE;
    if (px > sz.x && px < sz.x + sz.w && py > sz.y && py < sz.y + sz.h) return 'safezone';
    return null;
  }

  // ── Damage Queue System ──
  // Queues server damage results to display at the exact animation impact frame
  function queueDamage(damage, x, y, isCrit, isEnemy, vfxType, soundFn) {
    const now = Date.now();
    const elapsed = now - attackStartTime;
    const impactTime = ATTACK_ANIM_DURATION * ATTACK_IMPACT_PCT;
    const delay = Math.max(0, impactTime - elapsed);

    pendingDamageQueue.push({
      fireAt: now + delay,
      damage, x, y, isCrit, isEnemy, vfxType, soundFn
    });
  }

  function processPendingDamage() {
    const now = Date.now();
    for (let i = pendingDamageQueue.length - 1; i >= 0; i--) {
      const entry = pendingDamageQueue[i];
      if (now >= entry.fireAt) {
        createDamageText(entry.damage, entry.x, entry.y, entry.isCrit, entry.isEnemy);
        spawnBlood(entry.x, entry.y, entry.isCrit);
        if (entry.vfxType) triggerVfx(entry.vfxType);
        if (entry.soundFn) entry.soundFn();
        pendingDamageQueue.splice(i, 1);
      }
    }
  }

  return {
    init, preloadAssets, setPlayerInfo, setPlayerPos, setBoss, setBossHp, setBossPos,
    setDead, setBossAttackAnim, setOtherPlayers, setZone, clearZone, triggerVfx,
    checkPortalCollision, resizeCanvas, createDamageText, queueDamage,
    setPlayerRace, setMobs, setVirtualInput, triggerVirtualDodge,
    isDodging: () => dodgeState.active,
    getDodgeCooldownPct: () => {
      const elapsed = Date.now() - dodgeState.cooldown;
      return Math.min(1, elapsed / DODGE_COOLDOWN_MS);
    },
    getPlayer: () => player, getBoss: () => boss,
    getAttackStartTime: () => attackStartTime,
    ATTACK_ANIM_DURATION,
    ATTACK_IMPACT_PCT,
    ZONE_PORTALS
  };
})();
