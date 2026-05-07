const fs = require('fs');
const file = 'game-ui/rpg-layout/sprite_system.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/\/\/ ── Per-race visual theme[\s\S]*?(?=\/\/ ── Offscreen canvas)/, `// ── Image Cache & Sprite Configuration ─────────────────────────────────────
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
    'Human':     { path: 'assets/Martial Hero/Sprites/', frameW: 200, frameH: 200, idleFrames: 8, deathFrames: 6, oy: -20 },
    'Light Elf': { path: 'assets/Huntress 2/Sprites/Character/', frameW: 100, frameH: 100, idleFrames: 10, deathFrames: 10, oy: -10 },
    'Dark Elf':  { path: 'assets/Fantasy Warrior/Sprites/', frameW: 162, frameH: 162, idleFrames: 10, deathFrames: 7, oy: -15 },
    'Orc':       { path: 'assets/EVil Wizard 2/Sprites/', frameW: 250, frameH: 250, idleFrames: 8, deathFrames: 7, oy: -30 },
    'Dwarf':     { path: 'assets/Medieval Warrior Pack 3/Sprites/', frameW: 135, frameH: 135, idleFrames: 10, deathFrames: 9, oy: -15 }
  };

  const BOSS_IMAGES = {
    'forest':  'assets/boss_treant.png',
    'tower':   'assets/boss_lich.png',
    'volcano': 'assets/boss_kaelthas.png',
    'ocean':   'assets/boss_kraken.png'
  };

  `);

content = content.replace(/\/\/ ── Offscreen canvas[\s\S]*?function drawMob\(/, `// ── Public draw API ───────────────────────────────────────────────────────

  /**
   * Draw a player character at (x, y) on ctx. Animated via Date.now().
   */
  function drawPlayer(ctx, x, y, size, race, facing, isDead) {
    const config = SPRITE_CONFIG[race] || SPRITE_CONFIG['Human'];
    const action = isDead ? 'Death' : 'Idle';
    const numFrames = isDead ? config.deathFrames : config.idleFrames;
    const imgSrc = \`\${config.path}\${action}.png\`;
    const img = getImage(imgSrc);

    if (!img.complete || img.naturalWidth === 0) return;

    const t = Date.now();
    let frameIdx = Math.floor(t / 100) % numFrames;
    if (isDead) frameIdx = numFrames - 1; // stay dead at last frame

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
  function drawBoss(ctx, x, y, size, zoneId, isAttacking, isDead) {
    const src = BOSS_IMAGES[zoneId] || BOSS_IMAGES['tower'];
    const img = getImage(src);
    if (!img.complete || img.naturalWidth === 0) return;

    ctx.save();
    if (isDead) ctx.filter = 'grayscale(1) brightness(0.25)';
    if (isAttacking) ctx.filter = (ctx.filter || '') + ' brightness(1.6)';

    // Boss glow ring
    if (!isDead) {
      const glow = isAttacking ? 'rgba(255,0,0,0.6)' : 'rgba(255,0,0,0.2)';
      const gr = ctx.createRadialGradient(x + size / 2, y + size / 2, 0, x + size / 2, y + size / 2, size * 0.8);
      gr.addColorStop(0, glow);
      gr.addColorStop(1, 'transparent');
      ctx.fillStyle = gr;
      ctx.fillRect(x - size * 0.3, y - size * 0.3, size * 1.6, size * 1.6);
    }

    ctx.translate(x + size / 2, y + size / 2);
    const scale = size / 512; 
    ctx.scale(scale, scale);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.restore();
  }

  function drawMob(`);

content = content.replace(/function preloadAll\(\) \{\s+\/\/ no-op: procedural sprites need no preloading\s+\}/, `function preloadAll() {
    Object.values(SPRITE_CONFIG).forEach(cfg => {
      getImage(cfg.path + 'Idle.png');
      getImage(cfg.path + 'Death.png');
    });
    Object.values(BOSS_IMAGES).forEach(src => getImage(src));
  }`);

content = content.replace(/,\s*RACE_THEME,\s*BOSS_THEME/g, '');

fs.writeFileSync(file, content);
console.log('Done');
