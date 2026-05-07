const fs = require('fs');
const file = 'game-ui/rpg-layout/sprite_system.js';
let content = fs.readFileSync(file, 'utf8');

// Update SPRITE_CONFIG
const newConfig = `  const SPRITE_CONFIG = {
    'Human':     { path: 'assets/EVil Wizard 2/Sprites/', frameW: 250, frameH: 250, idleFrames: 8, deathFrames: 7, runFrames: 8, attackFrames: 8, attackFile: 'Attack1', oy: -30 },
    'Light Elf': { path: 'assets/Huntress 2/Sprites/Character/', frameW: 100, frameH: 100, idleFrames: 10, deathFrames: 10, runFrames: 8, attackFrames: 6, attackFile: 'Attack', oy: -10 },
    'Dark Elf':  { path: 'assets/Fantasy Warrior/Sprites/', frameW: 162, frameH: 162, idleFrames: 10, deathFrames: 7, runFrames: 8, attackFrames: 7, attackFile: 'Attack1', oy: -15 },
    'Orc':       { path: 'assets/Martial Hero/Sprites/', frameW: 200, frameH: 200, idleFrames: 8, deathFrames: 6, runFrames: 8, attackFrames: 6, attackFile: 'Attack1', oy: -20 },
    'Dwarf':     { path: 'assets/Medieval Warrior Pack 3/Sprites/', frameW: 135, frameH: 135, idleFrames: 10, deathFrames: 9, runFrames: 6, attackFrames: 4, attackFile: 'Attack1', oy: -15 }
  };`;
content = content.replace(/const SPRITE_CONFIG = \{[\s\S]*?\};\n/m, newConfig + '\\n');

// Update drawPlayer
const newDrawPlayer = `  function drawPlayer(ctx, x, y, size, race, facing, isDead, isMoving, isAttacking) {
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

    const imgSrc = \`\${config.path}\${actionFile}.png\`;
    const img = getImage(imgSrc);

    if (!img.complete || img.naturalWidth === 0) return;

    const t = Date.now();
    let frameIdx;
    
    if (isDead) {
      frameIdx = numFrames - 1; // stay dead at last frame
    } else if (isAttacking) {
      // 400ms duration for attack animation
      const msPerFrame = 400 / numFrames;
      frameIdx = Math.floor(t / msPerFrame) % numFrames;
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
  }`;

content = content.replace(/function drawPlayer\(ctx, x, y, size, race, facing, isDead\) \{[\s\S]*?ctx\.restore\(\);\n  \}/m, newDrawPlayer);

fs.writeFileSync(file, content);
console.log("Updated sprite_system.js for animations");
