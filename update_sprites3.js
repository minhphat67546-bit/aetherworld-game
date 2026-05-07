const fs = require('fs');
const file = 'game-ui/rpg-layout/sprite_system.js';
let content = fs.readFileSync(file, 'utf8');

// 1. Remove BOSS_IMAGES and replace with BOSS_CONFIG
content = content.replace(/const BOSS_IMAGES = \{[\s\S]*?\};/, `const BOSS_CONFIG = {
    'volcano': { 
      type: 'spritesheet', 
      src: 'assets/boss_demon_slime_FREE_v1.0/spritesheets/demon_slime_FREE_v1.0_288x160_spritesheet.png',
      frameW: 288, frameH: 160,
      idle: { row: 0, frames: 6 },
      attack: { row: 2, frames: 15 },
      death: { row: 4, frames: 22 },
      scaleY: 0.8 // Slime is wide, scale Y down a bit relative to W
    },
    'tower': {
      type: 'individual',
      basePath: 'assets/Bringer-Of-Death/Individual Sprite/',
      idle: { prefix: 'Walk/Bringer-of-Death_Walk_', suffix: '.png', frames: 8 },
      attack: { prefix: 'Attack/Bringer-of-Death_Attack_', suffix: '.png', frames: 10 },
      death: { prefix: 'Death/Bringer-of-Death_Death_', suffix: '.png', frames: 10 },
      frameW: 140, frameH: 93
    },
    'ocean': {
      type: 'individual',
      basePath: 'assets/imp_axe_demon/demon_axe_red/',
      idle: { prefix: 'ready_', suffix: '.png', frames: 6 },
      attack: { prefix: 'attack1_', suffix: '.png', frames: 6 },
      death: { prefix: 'dead_', suffix: '.png', frames: 4 },
      frameW: 160, frameH: 160
    },
    'forest': {
      type: 'individual',
      basePath: 'assets/modelgame/Elementals_Crystal_Mauler_Free_v1.0/animations/PNG/',
      idle: { prefix: 'idle/idle_', suffix: '.png', frames: 8 },
      attack: { prefix: '1_atk/1_atk_', suffix: '.png', frames: 7 },
      death: { prefix: 'death/death_', suffix: '.png', frames: 15 },
      frameW: 288, frameH: 128
    }
  };

  const MOB_CONFIG = {
    'forest': [
      { name: 'Goblin', src: 'assets/Monsters_Creatures_Fantasy/Goblin/', attackFrames: 8, deathFrames: 4, runFrames: 8 },
      { name: 'Mushroom', src: 'assets/Monsters_Creatures_Fantasy/Mushroom/', attackFrames: 8, deathFrames: 4, runFrames: 8 },
      { name: 'Skeleton', src: 'assets/Monsters_Creatures_Fantasy/Skeleton/', attackFrames: 8, deathFrames: 4, runFrames: 4 }, // Skeleton walk is 4
      { name: 'Flying eye', src: 'assets/Monsters_Creatures_Fantasy/Flying eye/', attackFrames: 8, deathFrames: 4, runFrames: 8, runFile: 'Flight' }
    ],
    'volcano': [
      { name: 'Fire Worm', basePath: 'assets/Fire Worm/Sprites/Worm/', individual: true, idleFrames: 9, runFrames: 9, runFile: 'Walk', attackFrames: 16, deathFrames: 8, frameW: 90, frameH: 90 }
    ]
  };`);

// 2. Rewrite drawBoss
const newDrawBoss = `  function drawBoss(ctx, x, y, size, zoneId, isAttacking, isDead) {
    const config = BOSS_CONFIG[zoneId] || BOSS_CONFIG['forest'];
    const t = Date.now();

    ctx.save();
    if (isDead) ctx.filter = 'grayscale(1) brightness(0.25)';
    if (isAttacking) ctx.filter = (ctx.filter || '') + ' brightness(1.3)';

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

    if (config.type === 'legacy') {
      const img = getImage(config.src);
      if (!img.complete || img.naturalWidth === 0) { ctx.restore(); return; }
      const scale = size / 512; 
      ctx.scale(scale, scale);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    } 
    else if (config.type === 'spritesheet') {
      const img = getImage(config.src);
      if (!img.complete || img.naturalWidth === 0) { ctx.restore(); return; }
      
      let anim = config.idle;
      if (isDead) anim = config.death;
      else if (isAttacking) anim = config.attack;
      
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
      ctx.scale(scale, scale * (config.scaleY || 1));
      ctx.drawImage(img, sX, sY, sW, sH, -sW / 2, -sH / 2, sW, sH);
    }
    else if (config.type === 'individual') {
      let anim = config.idle;
      if (isDead) anim = config.death;
      else if (isAttacking) anim = config.attack;
      
      let frameIdx = 0;
      if (isDead) {
        frameIdx = anim.frames; // 1-indexed
      } else {
        const msPerFrame = isAttacking ? (400 / anim.frames) : 100;
        frameIdx = (Math.floor(t / msPerFrame) % anim.frames) + 1; // 1-indexed
      }
      
      const src = \`\${config.basePath}\${anim.prefix}\${frameIdx}\${anim.suffix}\`;
      const img = getImage(src);
      if (!img.complete || img.naturalWidth === 0) { ctx.restore(); return; }
      
      const scale = size / config.frameH * 1.2; 
      if (zoneId === 'tower') ctx.scale(-scale, scale); // Lich faces left originally
      else ctx.scale(scale, scale);
      ctx.drawImage(img, -config.frameW / 2, -config.frameH / 2, config.frameW, config.frameH);
    }

    ctx.restore();
  }`;
content = content.replace(/function drawBoss\(ctx, x, y, size, zoneId, isAttacking, isDead\) \{[\s\S]*?ctx\.restore\(\);\n  \}/m, newDrawBoss);

// 3. Rewrite drawMob
const newDrawMob = `  function drawMob(ctx, x, y, size, mobType, isDead) {
    const t = Date.now();
    const floatOffset = Math.sin(t / 300) * 3;
    const cx = x + size / 2;
    const cy = y + size / 2 + floatOffset;

    ctx.save();
    if (isDead) ctx.filter = 'grayscale(1) brightness(0.28)';

    // Giả sử lấy zone từ caller. Hiện tại caller gọi SpriteSystem.drawMob(..., idx, false)
    // Tạm thời coi zone forest là mặc định, volcano nếu idx đặc biệt, nhưng ko có zone param.
    // Lấy đại zone 'forest' cho các con, trừ khi ở volcano
    // Ta có thể xác định zone qua window.currentZoneId hoặc pass qua param
    const zoneId = window.currentZoneId || 'forest'; 
    let mobList = MOB_CONFIG[zoneId] || MOB_CONFIG['forest'];
    if (mobList.length === 0) mobList = MOB_CONFIG['forest'];

    const config = mobList[mobType % mobList.length];

    if (config.individual) {
      // Fire worm individual
      let actionStr = 'Idle', numFrames = config.idleFrames;
      if (isDead) { actionStr = 'Death'; numFrames = config.deathFrames; }
      // Assuming attacking mob logic if needed, else just idle/run
      
      const msPerFrame = 120;
      let frameIdx = isDead ? numFrames - 1 : Math.floor(t / msPerFrame) % numFrames;
      const imgSrc = \`\${config.basePath}\${actionStr}.png\`;
      const img = getImage(imgSrc);
      
      if (img.complete && img.naturalWidth > 0) {
        ctx.translate(cx, cy);
        const sW = config.frameW, sH = config.frameH;
        const scale = size / sH * 1.2;
        ctx.scale(-scale, scale); // Flip horizontally if needed
        ctx.drawImage(img, frameIdx * sW, 0, sW, sH, -sW/2, -sH/2, sW, sH);
      }
    } else {
      // Luizmelo monsters (spritesheet 150x150, 1 row)
      let actionFile = 'Idle', numFrames = 4;
      if (isDead) { actionFile = 'Death'; numFrames = config.deathFrames; }
      // Since no mob movement state passed, default to Idle.
      const imgSrc = \`\${config.src}\${actionFile}.png\`;
      const img = getImage(imgSrc);
      
      if (img.complete && img.naturalWidth > 0) {
        const msPerFrame = 150;
        let frameIdx = isDead ? numFrames - 1 : Math.floor(t / msPerFrame) % numFrames;
        
        ctx.translate(cx, cy);
        const sW = 150, sH = 150;
        const scale = size / sH * 1.6;
        ctx.scale(scale, scale);
        ctx.drawImage(img, frameIdx * sW, 0, sW, sH, -sW/2, -sH/2, sW, sH);
      }
    }
    
    ctx.restore();
  }`;
content = content.replace(/function drawMob\(ctx, x, y, size, mobType, isDead\) \{[\s\S]*?ctx\.restore\(\);\n  \}/m, newDrawMob);

// 4. Update preloadAll to clear out old legacy Boss Images
const newPreload = `  function preloadAll() {
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
       else if (cfg.type === 'individual') getImage(\`\${cfg.basePath}\${cfg.idle.prefix}1\${cfg.idle.suffix}\`);
    });
  }`;
content = content.replace(/function preloadAll\(\) \{[\s\S]*?Object\.values\(BOSS_IMAGES\)\.forEach\(src => getImage\(src\)\);\n  \}/m, newPreload);

fs.writeFileSync(file, content);
console.log("Updated sprite_system.js for new bosses and mobs");
