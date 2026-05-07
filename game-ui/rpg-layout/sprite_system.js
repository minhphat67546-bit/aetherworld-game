/**
 * AetherWorld — Sprite System v3
 * Procedural pixel-art sprites drawn with Canvas API (no external assets needed).
 * Each race/boss gets a unique color palette + silhouette drawn per frame.
 *
 * Also provides sidebar GIF preview URLs from luizmelo.itch.io (CC0) for the
 * right-panel avatar (HTML <img> — no CORS issue).
 */
const SpriteSystem = (function () {
  'use strict';

  // ── luizmelo.itch.io CC0 preview GIFs (for sidebar avatar only) ────────────
  const RACE_SPRITES = {
    'Human': 'https://img.itch.zone/aW1hZ2UvNTgxMTI4LzMwNzY5NjcuZ2lm/original/p6b8z7.gif',
    'Light Elf': 'https://img.itch.zone/aW1hZ2UvNTUwNTE5LzI4OTI2MTYuZ2lm/original/Jo5uEU.gif',
    'Dark Elf': 'https://img.itch.zone/aW1hZ2UvNzkyNzYzLzQ0NjU4NTAuZ2lm/original/3A0Lwm.gif',
    'Orc': 'https://img.itch.zone/aW1hZ2UvNTA3NjI5LzI2NDcxNDUuZ2lm/original/B332lL.gif',
    'Dwarf': 'https://img.itch.zone/aW1hZ2UvNTEzNTc5LzI2OTI0NjMuZ2lm/original/1fhOt%2B.gif',
  };

  // ── Image Cache & Sprite Configuration ─────────────────────────────────────
  const _imgCache = {};
  function getImage(src) {
    if (!_imgCache[src]) {
      const img = new Image();
      img.src = src;
      _imgCache[src] = img;
    }
    return _imgCache[src];
  }

  const SPRITE_CONFIG = {
    'Human': { path: 'assets/EVil Wizard 2/Sprites/', frameW: 250, frameH: 250, idleFrames: 8, deathFrames: 7, runFrames: 8, attackFrames: 8, attackFile: 'Attack1', oy: -30 },
    'Light Elf': { path: 'assets/Huntress 2/Sprites/Character/', frameW: 100, frameH: 100, idleFrames: 10, deathFrames: 10, runFrames: 8, attackFrames: 6, attackFile: 'Attack', oy: -10 },
    'Dark Elf': { path: 'assets/Fantasy Warrior/Sprites/', frameW: 162, frameH: 162, idleFrames: 10, deathFrames: 7, runFrames: 8, attackFrames: 7, attackFile: 'Attack1', oy: -15 },
    'Orc': { path: 'assets/Martial Hero/Sprites/', frameW: 200, frameH: 200, idleFrames: 8, deathFrames: 6, runFrames: 8, attackFrames: 6, attackFile: 'Attack1', oy: -20 },
    'Dwarf': { path: 'assets/Medieval Warrior Pack 3/Sprites/', frameW: 135, frameH: 135, idleFrames: 10, deathFrames: 9, runFrames: 6, attackFrames: 4, attackFile: 'Attack1', oy: -15 }
  };
  const BOSS_CONFIG = {
    'volcano': {
      type: 'spritesheet',
      src: 'assets/modelgame/boss_demon_slime_FREE_v1.0/spritesheets/demon_slime_FREE_v1.0_288x160_spritesheet.png',
      frameW: 288, frameH: 160,
      idle: { row: 0, frames: 6 },
      walk: { row: 1, frames: 6 },
      attack: { row: 2, frames: 15 },
      death: { row: 4, frames: 22 },
      scaleY: 0.8,
      groundOffset: -19,
      pivotOffsetX: 0
    },
    'tower': {
      type: 'individual',
      basePath: 'assets/modelgame/Bringer-Of-Death/Individual Sprite/',
      idle: { prefix: 'Idle/Bringer-of-Death_Idle_', suffix: '.png', frames: 8 },
      walk: { prefix: 'Walk/Bringer-of-Death_Walk_', suffix: '.png', frames: 8 },
      attack: { prefix: 'Attack/Bringer-of-Death_Attack_', suffix: '.png', frames: 10 },
      death: { prefix: 'Death/Bringer-of-Death_Death_', suffix: '.png', frames: 10 },
      frameW: 140, frameH: 93,
      groundOffset: -19,
      pivotOffsetX: -70 // Bringer of Death is not centered, this shifts the pivot to the body
    },
    'ocean': {
      type: 'individual',
      basePath: 'assets/imp_axe_demon/demon_axe_red/',
      idle: { prefix: 'ready_', suffix: '.png', frames: 6 },
      walk: { prefix: 'walk_', suffix: '.png', frames: 6 },
      attack: { prefix: 'attack1_', suffix: '.png', frames: 6 },
      death: { prefix: 'dead_', suffix: '.png', frames: 4 },
      frameW: 160, frameH: 160,
      groundOffset: -40,
      pivotOffsetX: 0
    },
    'forest': {
      type: 'individual',
      basePath: 'assets/modelgame/Elementals_Crystal_Mauler_Free_v1.0/animations/PNG/',
      idle: { prefix: 'idle/idle_', suffix: '.png', frames: 8 },
      walk: { prefix: 'run/run_', suffix: '.png', frames: 8 },
      attack: { prefix: '1_atk/1_atk_', suffix: '.png', frames: 7 },
      death: { prefix: 'death/death_', suffix: '.png', frames: 15 },
      frameW: 288, frameH: 128,
      groundOffset: -19,
      pivotOffsetX: 0
    }
  };

  const VFX_CONFIG = {
    'tower_cast': {
      type: 'individual',
      basePath: 'assets/modelgame/Bringer-Of-Death/Individual Sprite/Spell/',
      prefix: 'Bringer-of-Death_Spell_', suffix: '.png', frames: 16,
      frameW: 140, frameH: 93,
      scaleMultiplier: 3.0,
      offsetY: -30
    },
    'forest_cast': {
      type: 'individual',
      basePath: 'assets/modelgame/Elementals_Crystal_Mauler_Free_v1.0/animations/PNG/sp_atk/',
      prefix: 'sp_atk_', suffix: '.png', frames: 15,
      frameW: 288, frameH: 128,
      scaleMultiplier: 2.0,
      offsetY: -50
    },
    'forest': {
      type: 'individual',
      basePath: 'assets/modelgame/Elementals_Crystal_Mauler_Free_v1.0/animations/PNG/1_atk/',
      prefix: '1_atk_', suffix: '.png', frames: 7,
      frameW: 288, frameH: 128,
      scaleMultiplier: 1.0,
      offsetY: 0
    },
    'volcano_cast': {
      type: 'spritesheet',
      src: 'assets/modelgame/boss_demon_slime_FREE_v1.0/spritesheets/demon_slime_FREE_v1.0_288x160_spritesheet.png',
      row: 2, frames: 15,
      frameW: 288, frameH: 160,
      scaleMultiplier: 1.8,
      offsetY: -40
    }
  };

  const MOB_CONFIG = {
    'forest': [
      { name: 'Goblin', src: 'assets/Monsters_Creatures_Fantasy/Goblin/', attackFrames: 8, deathFrames: 4, runFrames: 8, groundOffset: 0 },
      { name: 'Mushroom', src: 'assets/Monsters_Creatures_Fantasy/Mushroom/', attackFrames: 8, deathFrames: 4, runFrames: 8, groundOffset: 0 },
      { name: 'Skeleton', src: 'assets/Monsters_Creatures_Fantasy/Skeleton/', attackFrames: 8, deathFrames: 4, runFrames: 4, groundOffset: 0 }, // Skeleton walk is 4
      { name: 'Flying eye', src: 'assets/Monsters_Creatures_Fantasy/Flying eye/', attackFrames: 8, deathFrames: 4, runFrames: 8, runFile: 'Flight', groundOffset: 0 }
    ],
    'volcano': [
      { name: 'Fire Worm', basePath: 'assets/Fire Worm/Sprites/Worm/', individual: true, idleFrames: 9, runFrames: 9, runFile: 'Walk', attackFrames: 16, deathFrames: 8, frameW: 90, frameH: 90, groundOffset: 0 }
    ]
  };

  // ── Public draw API ───────────────────────────────────────────────────────

  /**
   * Draw a player character at (x, y) on ctx. Animated via Date.now().
   */
  function drawPlayer(ctx, x, y, size, race, facing, isDead, isMoving, isAttacking) {
    const config = SPRITE_CONFIG[race] || SPRITE_CONFIG['Human'];

    let actionFile = 'Idle';
    let numFrames = config.idleFrames;

    if (isDead) {
      actionFile = 'Death';
      numFrames = config.deathFrames;
    } else if (isAttacking) {
      actionFile = config.attackFile;
      numFrames = config.attackFrames;
    } else if (isMoving) {
      actionFile = 'Run';
      numFrames = config.runFrames;
    }

    const imgSrc = `${config.path}${actionFile}.png`;
    const img = getImage(imgSrc);

    if (!img.complete || img.naturalWidth === 0) return;

    const t = Date.now();
    let frameIdx;

    if (isDead) {
      frameIdx = numFrames - 1; // stay dead at last frame
    } else if (isAttacking) {
      // Sync with GameEngine attack timing — start from frame 0 at attackStartTime
      const attackDuration = (typeof GameEngine !== 'undefined' && GameEngine.ATTACK_ANIM_DURATION) ? GameEngine.ATTACK_ANIM_DURATION : 500;
      const attackStart = (typeof GameEngine !== 'undefined' && GameEngine.getAttackStartTime) ? GameEngine.getAttackStartTime() : (t - 200);
      const elapsed = t - attackStart;
      const msPerFrame = attackDuration / numFrames;
      frameIdx = Math.min(numFrames - 1, Math.floor(elapsed / msPerFrame)); // clamp to last frame, don't loop
    } else if (isMoving) {
      // Fast run animation
      frameIdx = Math.floor(t / 80) % numFrames;
    } else {
      // Idle animation
      frameIdx = Math.floor(t / 120) % numFrames;
    }

    const sW = config.frameW;
    const sH = config.frameH;
    const sX = frameIdx * sW;

    ctx.save();
    if (isDead) ctx.filter = 'grayscale(1) brightness(0.28)';

    ctx.translate(x + size / 2, y + size / 2 + (config.oy || 0));
    if (facing === 'left') ctx.scale(-1, 1);

    const scale = size / (sH * 0.45);
    ctx.scale(scale, scale);

    ctx.drawImage(img, sX, 0, sW, sH, -sW / 2, -sH / 2, sW, sH);
    ctx.restore();
  }

  /**
   * Draw a boss character at (x, y) on ctx.
   */
  function drawBoss(ctx, x, y, size, zoneId, isAttacking, isDead, playerX, isMoving) {
    const config = BOSS_CONFIG[zoneId] || BOSS_CONFIG['forest'];
    const t = Date.now();

    ctx.save();
    if (isDead) ctx.filter = 'grayscale(1) brightness(0.25)';
    if (isAttacking) ctx.filter = (ctx.filter || '') + ' brightness(1.3)';

    // Boss glow ring anchored at center + groundOffset to match the sprite's visual center
    if (!isDead) {
      const goy = config.groundOffset || 0;
      const cy = y + size / 2 + goy;
      const cx = x + size / 2;
      const glow = isAttacking ? 'rgba(255,0,0,0.6)' : 'rgba(255,0,0,0.2)';
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.8);
      gr.addColorStop(0, glow);
      gr.addColorStop(1, 'transparent');
      ctx.fillStyle = gr;
      ctx.fillRect(cx - size * 0.8, cy - size * 0.8, size * 1.6, size * 1.6);
    }

    // Anchor at BOTTOM CENTER for drawing the boss sprite
    ctx.translate(x + size / 2, y + size);

    if (config.type === 'legacy') {
      const img = getImage(config.src);
      if (!img.complete || img.naturalWidth === 0) { ctx.restore(); return; }
      const scale = size / 512;
      ctx.scale(scale, scale);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight);
    }
    else if (config.type === 'spritesheet') {
      const img = getImage(config.src);
      if (!img.complete || img.naturalWidth === 0) { ctx.restore(); return; }

      let anim = config.idle;
      if (isDead) anim = config.death;
      else if (isAttacking) anim = config.attack;
      else if (isMoving && config.walk) anim = config.walk;

      let frameIdx = 0;
      if (isDead) {
        frameIdx = anim.frames - 1;
      } else {
        const msPerFrame = isAttacking ? (400 / anim.frames) : 120;
        frameIdx = Math.floor(t / msPerFrame) % anim.frames;
      }

      const sW = config.frameW, sH = config.frameH;
      const sX = frameIdx * sW;
      const sY = anim.row * sH;

      const scale = size / sH * 1.4;

      let shouldFaceLeft = true;
      if (playerX !== null && playerX !== undefined) {
        const cx = x + size / 2;
        shouldFaceLeft = (playerX < cx);
      }
      const finalScale = shouldFaceLeft ? scale : -scale;
      const actualScaleY = scale * (config.scaleY || 1);
      ctx.scale(finalScale, actualScaleY);

      const goy = (config.groundOffset || 0) / actualScaleY;
      const gox = (config.pivotOffsetX || 0) / scale;
      ctx.drawImage(img, sX, sY, sW, sH, -sW / 2 + gox, -sH - goy, sW, sH);
    }
    else if (config.type === 'individual') {
      let anim = config.idle;
      if (isDead) anim = config.death;
      else if (isAttacking) anim = config.attack;
      else if (isMoving && config.walk) anim = config.walk;

      let frameIdx = 0;
      if (isDead) {
        frameIdx = anim.frames; // 1-indexed
      } else {
        const msPerFrame = isAttacking ? (400 / anim.frames) : 100;
        frameIdx = (Math.floor(t / msPerFrame) % anim.frames) + 1; // 1-indexed
      }

      const src = `${config.basePath}${anim.prefix}${frameIdx}${anim.suffix}`;
      const img = getImage(src);
      if (!img.complete || img.naturalWidth === 0) { ctx.restore(); return; }

      const scale = size / config.frameH * 1.2;

      // Dynamic flip logic
      let facesLeftNatively = (zoneId === 'tower'); // Add other zone IDs if they natively face left
      let shouldFaceLeft = true; // Default to facing left
      if (playerX !== null && playerX !== undefined) {
        const cx = x + size / 2;
        shouldFaceLeft = (playerX < cx);
      }

      let finalScale = scale;
      if (facesLeftNatively) {
        finalScale = shouldFaceLeft ? scale : -scale;
      } else {
        finalScale = shouldFaceLeft ? -scale : scale;
      }
      ctx.scale(finalScale, scale);

      const goy = (config.groundOffset || 0) / scale;
      const gox = (config.pivotOffsetX || 0) / scale;
      ctx.drawImage(img, -config.frameW / 2 + gox, -config.frameH - goy, config.frameW, config.frameH);
    }

    ctx.restore();
  }

  function drawMob(ctx, x, y, size, mobType, isDead, zoneIdParam, playerX) {
    const t = Date.now();
    const floatOffset = Math.sin(t / 300) * 3;
    const cx = x + size / 2;
    const cy = y + size / 2 + floatOffset;

    ctx.save();
    if (isDead) ctx.filter = 'grayscale(1) brightness(0.28)';

    const zoneId = zoneIdParam || window.currentZoneId || 'forest';
    let mobList = MOB_CONFIG[zoneId] || MOB_CONFIG['forest'];
    if (mobList.length === 0) mobList = MOB_CONFIG['forest'];

    const config = mobList[mobType % mobList.length];

    let shouldFaceLeft = true;
    if (playerX !== null && playerX !== undefined) {
      shouldFaceLeft = (playerX < cx);
    }

    if (config.individual) {
      // Fire worm individual
      let actionStr = 'Idle', numFrames = config.idleFrames;
      if (isDead) { actionStr = 'Death'; numFrames = config.deathFrames; }
      // Assuming attacking mob logic if needed, else just idle/run

      const msPerFrame = 120;
      let frameIdx = isDead ? numFrames - 1 : Math.floor(t / msPerFrame) % numFrames;
      const imgSrc = `${config.basePath}${actionStr}.png`;
      const img = getImage(imgSrc);

      if (img.complete && img.naturalWidth > 0) {
        ctx.translate(cx, cy);
        const sW = config.frameW, sH = config.frameH;
        const scale = size / sH * 1.2;
        const goy = (config.groundOffset || 0) / scale;
        ctx.scale(shouldFaceLeft ? -scale : scale, scale);
        ctx.drawImage(img, frameIdx * sW, 0, sW, sH, -sW / 2, -sH / 2 - goy, sW, sH);
      }
    } else {
      // Luizmelo monsters (spritesheet 150x150, 1 row)
      let actionFile = 'Idle', numFrames = 4;
      if (isDead) { actionFile = 'Death'; numFrames = config.deathFrames; }
      // Since no mob movement state passed, default to Idle.
      const imgSrc = `${config.src}${actionFile}.png`;
      const img = getImage(imgSrc);

      if (img.complete && img.naturalWidth > 0) {
        const msPerFrame = 150;
        let frameIdx = isDead ? numFrames - 1 : Math.floor(t / msPerFrame) % numFrames;

        ctx.translate(cx, cy);
        const sW = 150, sH = 150;
        const scale = size / sH * 1.6;
        const goy = (config.groundOffset || 0) / scale;
        ctx.scale(shouldFaceLeft ? -scale : scale, scale);
        ctx.drawImage(img, frameIdx * sW, 0, sW, sH, -sW / 2, -sH / 2 - goy, sW, sH);
      }
    }

    ctx.restore();
  }

  function drawAnimatedVfx(ctx, x, y, size, vfxType, lifeProgress, playerX, bossX) {
    const config = VFX_CONFIG[vfxType];
    if (!config) return false;

    // Determine if we should flip horizontally (match boss facing direction)
    // If player is to the left of boss, boss faces left, so VFX should flip left
    const flipX = (typeof playerX !== 'undefined' && typeof bossX !== 'undefined') ? (playerX < bossX) : false;

    if (config.type === 'individual') {
        const frameIdx = Math.floor(lifeProgress * config.frames) + 1;
        const boundedIdx = Math.min(Math.max(1, frameIdx), config.frames);
        const imgSrc = `${config.basePath}${config.prefix}${boundedIdx}${config.suffix}`;
        const img = getImage(imgSrc);
        if (img.complete && img.naturalWidth > 0) {
            ctx.save();
            ctx.translate(x, y + (config.offsetY || 0));
            const scale = (size / config.frameH) * (config.scaleMultiplier || 1);
            ctx.scale(flipX ? -scale : scale, scale);
            ctx.drawImage(img, -config.frameW / 2, -config.frameH / 2, config.frameW, config.frameH);
            ctx.restore();
            return true;
        }
    } else if (config.type === 'spritesheet') {
        const frameIdx = Math.floor(lifeProgress * config.frames);
        const boundedIdx = Math.min(Math.max(0, frameIdx), config.frames - 1);
        const img = getImage(config.src);
        if (img.complete && img.naturalWidth > 0) {
            ctx.save();
            ctx.translate(x, y + (config.offsetY || 0));
            const scale = (size / config.frameH) * (config.scaleMultiplier || 1);
            ctx.scale(flipX ? -scale : scale, scale);
            const sW = config.frameW;
            const sH = config.frameH;
            ctx.drawImage(img, boundedIdx * sW, config.row * sH, sW, sH, -sW / 2, -sH / 2, sW, sH);
            ctx.restore();
            return true;
        }
    }
    return false;
  }

  // ── Sidebar avatar URLs (luizmelo CC0) ────────────────────────────────────
  function getRaceUrl(race) {
    return RACE_SPRITES[race] || RACE_SPRITES['Human'];
  }

  function preloadAll() {
    Object.values(SPRITE_CONFIG).forEach(cfg => {
      getImage(cfg.path + 'Idle.png');
      getImage(cfg.path + 'Death.png');
      getImage(cfg.path + 'Run.png');
      getImage(cfg.path + cfg.attackFile + '.png');
    });
    // Boss preload (partial to not block)
    ['volcano', 'tower', 'ocean', 'forest'].forEach(zone => {
      const cfg = BOSS_CONFIG[zone];
      if (cfg.type === 'legacy') getImage(cfg.src);
      else if (cfg.type === 'spritesheet') getImage(cfg.src);
      else if (cfg.type === 'individual') {
        getImage(`${cfg.basePath}${cfg.idle.prefix}1${cfg.idle.suffix}`);
        if (cfg.walk) getImage(`${cfg.basePath}${cfg.walk.prefix}1${cfg.walk.suffix}`);
      }
    });
    // VFX preload
    Object.keys(VFX_CONFIG).forEach(key => {
        const cfg = VFX_CONFIG[key];
        if (cfg.type === 'individual') {
            getImage(`${cfg.basePath}${cfg.prefix}1${cfg.suffix}`);
        } else if (cfg.type === 'spritesheet') {
            getImage(cfg.src);
        }
    });
  }

  function getBossGroundOffset(zoneId) {
    const config = BOSS_CONFIG[zoneId] || BOSS_CONFIG['forest'];
    return config.groundOffset || 0;
  }

  return {
    drawPlayer,
    drawBoss,
    drawMob,
    drawAnimatedVfx,
    getRaceUrl,
    preloadAll,
    getBossGroundOffset,
    RACE_SPRITES,
    SPRITE_CONFIG,
  };
})();
