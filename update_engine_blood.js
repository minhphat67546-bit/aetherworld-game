const fs = require('fs');
const file = 'game-ui/rpg-layout/engine.js';
let content = fs.readFileSync(file, 'utf8');

// Add blood VFX logic
const newVFXCode = `
  const bloodParticles = [];

  function spawnBlood(x, y, isCrit) {
      const count = isCrit ? 15 : 8;
      for(let i=0; i<count; i++) {
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
      for(let i = bloodParticles.length - 1; i >= 0; i--) {
          const p = bloodParticles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.5; // gravity
          p.life -= 0.03;
          
          if(p.life <= 0) {
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
`;

// Insert blood VFX definitions after damageTexts array
content = content.replace(/(let damageTexts = \[\];)/, "$1\n" + newVFXCode);

// Inject spawnBlood into createDamageText
content = content.replace(/(function createDamageText\(amount, x, y, isCrit, isEnemy = false\) \{[\s\S]*?damageTexts\.push\(\{[\s\S]*?\}\);)/, 
  "$1\n    if(!isEnemy) spawnBlood(x, y + 20, isCrit);"); // Only spawn blood when attacking enemies (isEnemy = false means text is white/yellow, implying damage dealt to enemies) Wait, 'isEnemy = false' means we hit them.

// Ensure renderBloodParticles is called in renderCombatZone
content = content.replace(/(renderDamageTexts\(\);)/, "$1\n    renderBloodParticles();");

// Fix currentZoneId being passed to drawMob
content = content.replace(/(SpriteSystem\.drawMob\(ctx, drawX, drawY, MOB_DRAW_SIZE, idx, false)(?:\);)/, "$1, currentZoneId);");

// Fix drawBoss params in engine.js since I added zoneId to drawMob, let's make sure drawBoss doesn't miss args. 
// drawBoss(ctx, x, y, size, zoneId, isAttacking, isDead) is already called correctly:
// SpriteSystem.drawBoss(ctx, boss.x, renderY, BOSS_SIZE, currentZoneId, bossAttackAnim, !boss.alive);

fs.writeFileSync(file, content);
console.log("Updated engine.js with blood VFX and zone mob rendering");
