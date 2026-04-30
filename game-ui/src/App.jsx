import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { Shield, Sword, Skull, Activity, ArrowLeft, Users, User, Home, Wifi, WifiOff, Globe, Lock, LogIn, LogOut, Package } from 'lucide-react';

const SOCKET_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : window.location.origin;
const API_URL = SOCKET_URL;
const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'], autoConnect: false });

// Asset mapping
const ZONE_ASSETS = {
  forest:  { bg: '/assets/zone_forest.png',  boss: '/assets/boss_treant.png',   color: '#2d6a4f', vfx: '/assets/vfx_forest.png' },
  volcano: { bg: '/assets/zone_volcano.png',  boss: '/assets/boss_kaelthas.png', color: '#ef476f', vfx: '/assets/vfx_volcano.png' },
  ocean:   { bg: '/assets/zone_ocean.png',    boss: '/assets/boss_kraken.png',   color: '#0077b6', vfx: '/assets/vfx_ocean.png' },
  tower:   { bg: '/assets/zone_tower.png',    boss: '/assets/boss_lich.png',     color: '#9d4edd', vfx: '/assets/vfx_tower.png' },
};

const PLAYER_IMG = '/assets/player.png';

const ZONE_POSITIONS = {
  forest:  { top: '25%', left: '55%' },
  volcano: { top: '65%', left: '75%' },
  ocean:   { top: '70%', left: '30%' },
  tower:   { top: '25%', left: '25%' },
};

// ====== GAME ARENA COMPONENT ======
function GameArena({ activeZone, bossHp, bossHpMax, bossStatus, character, onAttack, isAttacking, playersInZone, combatLogs, otherPlayersMap, initialPos, isDead, deathTimer, lootDrop, showLoot, onCloseLoot, bossPos, bossAttackingAnim }) {
  const [playerPos, setPlayerPos] = useState(initialPos || { x: 150, y: 300 });
  const [facing, setFacing] = useState('right');
  const [isMoving, setIsMoving] = useState(false);
  const keysRef = useRef(new Set());
  const arenaRef = useRef(null);
  const animFrame = useRef(null);

  const SPEED = 4;
  const ARENA_W = 900;
  const ARENA_H = 500;
  const PLAYER_SIZE = 80;
  const BOSS_SIZE = 220;
  const ATTACK_RANGE = 180;

  const assets = ZONE_ASSETS[activeZone.id] || ZONE_ASSETS.forest;

  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      if (['w','a','s','d'].includes(key)) {
        e.preventDefault();
        keysRef.current.add(key);
      }
      // Space bar attack
      if (e.code === 'Space') {
        e.preventDefault();
        if (isDead) return;
        const dx = ((bossPos?.x || 650) + BOSS_SIZE/2) - (playerPos.x + PLAYER_SIZE/2);
        const dy = ((bossPos?.y || 120) + BOSS_SIZE/2) - (playerPos.y + PLAYER_SIZE/2);
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < ATTACK_RANGE + BOSS_SIZE/2) {
          onAttack();
        }
      }
    };
    const handleKeyUp = (e) => {
      keysRef.current.delete(e.key.toLowerCase());
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [playerPos, onAttack]);

  // Movement loop + send position to server
  const lastSent = useRef(0);
  useEffect(() => {
    const gameLoop = () => {
      const keys = keysRef.current;
      let moving = false;
      setPlayerPos(prev => {
        if (isDead) return prev;  // Can't move when dead
        let { x, y } = prev;
        if (keys.has('a')) { x -= SPEED; setFacing('left'); moving = true; }
        if (keys.has('d')) { x += SPEED; setFacing('right'); moving = true; }
        if (keys.has('w')) { y -= SPEED; moving = true; }
        if (keys.has('s')) { y += SPEED; moving = true; }
        x = Math.max(0, Math.min(ARENA_W - PLAYER_SIZE, x));
        y = Math.max(0, Math.min(ARENA_H - PLAYER_SIZE, y));
        // Send position to server (throttled)
        const now = Date.now();
        if (moving && now - lastSent.current > 80) {
          socket.emit('player_move', { x, y });
          lastSent.current = now;
        }
        return { x, y };
      });
      setIsMoving(moving);
      animFrame.current = requestAnimationFrame(gameLoop);
    };
    animFrame.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animFrame.current);
  }, [isDead]);

  // Update position when respawned
  useEffect(() => {
    if (!isDead) setPlayerPos(initialPos || { x: 150, y: 300 });
  }, [isDead, initialPos]);

  // Distance check
  const dx = ((bossPos?.x || 650) + BOSS_SIZE/2) - (playerPos.x + PLAYER_SIZE/2);
  const dy = ((bossPos?.y || 120) + BOSS_SIZE/2) - (playerPos.y + PLAYER_SIZE/2);
  const distToBoss = Math.sqrt(dx*dx + dy*dy);
  const inRange = distToBoss < ATTACK_RANGE + BOSS_SIZE/2;

  return (
    <div style={{ display: 'flex', gap: '15px', flexDirection: 'column' }}>
      {/* Game Arena */}
      <div ref={arenaRef} style={{
        width: '100%', maxWidth: ARENA_W, height: ARENA_H,
        backgroundImage: `url(${assets.bg})`,
        backgroundSize: 'cover', backgroundPosition: 'center',
        borderRadius: '16px', border: `2px solid ${assets.color}`,
        position: 'relative', overflow: 'hidden',
        boxShadow: `0 0 30px ${assets.color}40`,
        margin: '0 auto',
        animation: bossAttackingAnim ? 'vfxScreenShake 0.4s ease-in-out' : 'none',
      }}>
        {/* Dark overlay for readability */}
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1 }}></div>

        {/* Boss */}
        <div style={{
          position: 'absolute', left: bossPos?.x || 650, top: bossPos?.y || 120,
          width: BOSS_SIZE, height: BOSS_SIZE, zIndex: 2,
          transition: 'left 1s linear, top 1s linear, filter 0.2s, transform 0.2s',
          filter: bossHp <= 0 ? 'grayscale(1) brightness(0.3)' : (bossAttackingAnim ? 'drop-shadow(0 0 20px rgba(255,0,0,0.8)) brightness(1.5)' : 'none'),
          animation: bossHp > 0 && !bossAttackingAnim ? 'bossIdle 2s ease-in-out infinite' : 'none',
          transform: bossAttackingAnim ? 'scale(1.15)' : 'scale(1)',
        }}>
          <img src={assets.boss} alt="Boss" style={{
            width: '100%', height: '100%', objectFit: 'contain',
            filter: 'drop-shadow(0 0 15px rgba(255,0,0,0.6))',
          }} />
          {/* VFX Spell Effect - appears on attack */}
          {bossAttackingAnim && assets.vfx && (
            <img src={assets.vfx} alt="VFX" style={{
              position: 'absolute', top: '-60%', left: '-60%',
              width: '220%', height: '220%', objectFit: 'contain',
              pointerEvents: 'none', zIndex: 10,
              animation: 'vfxBurst 0.6s ease-out forwards',
              mixBlendMode: 'screen',
              opacity: 0.9,
            }} />
          )}
          {/* Boss HP bar above boss */}
          {bossHp > 0 && (
            <div style={{ position: 'absolute', top: -25, left: '50%', transform: 'translateX(-50%)', width: '80%' }}>
              <div style={{ background: 'rgba(0,0,0,0.7)', borderRadius: '4px', height: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)' }}>
                <div style={{ height: '100%', background: 'linear-gradient(90deg, #d00000, #ef476f)', width: `${(bossHp/bossHpMax)*100}%`, transition: 'width 0.3s' }}></div>
              </div>
            </div>
          )}
        </div>

        {/* Player character */}
        <div style={{
          position: 'absolute', left: playerPos.x, top: playerPos.y,
          width: PLAYER_SIZE, height: PLAYER_SIZE, zIndex: 3,
          transform: facing === 'left' ? 'scaleX(-1)' : 'scaleX(1)',
          transition: 'transform 0.1s',
          animation: isDead ? 'none' : (isMoving ? 'playerBob 0.3s ease-in-out infinite' : 'none'),
          filter: isDead ? 'grayscale(1) brightness(0.3)' : 'none',
        }}>
          <img src={PLAYER_IMG} alt="Player" style={{
            width: '100%', height: '100%', objectFit: 'contain',
            filter: 'drop-shadow(0 0 8px rgba(157,78,221,0.8))',
          }} />
          {/* Player name tag */}
          <div style={{
            position: 'absolute', top: -20, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.7)', padding: '2px 8px', borderRadius: '4px',
            fontSize: '0.7rem', whiteSpace: 'nowrap', color: '#e0aaff',
            border: '1px solid rgba(157,78,221,0.5)',
          }}>{character.name}</div>
          {/* Player HP bar */}
          <div style={{ position: 'absolute', bottom: -10, left: '10%', width: '80%' }}>
            <div style={{ background: 'rgba(0,0,0,0.7)', borderRadius: '3px', height: '5px', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#06d6a0', width: `${(character.hp/character.hpMax)*100}%`, transition: 'width 0.3s' }}></div>
            </div>
          </div>
        </div>

        {/* OTHER PLAYERS (Guild mode) */}
        {Object.values(otherPlayersMap).map(op => (
          <div key={op.name} style={{
            position: 'absolute', left: op.x, top: op.y,
            width: 70, height: 70, zIndex: 3,
            transition: 'left 0.1s linear, top 0.1s linear',
          }}>
            <img src={PLAYER_IMG} alt={op.name} style={{
              width: '100%', height: '100%', objectFit: 'contain',
              filter: op.isDead
                ? 'drop-shadow(0 0 6px rgba(255,0,0,0.5)) grayscale(1) brightness(0.3)'
                : 'drop-shadow(0 0 6px rgba(6,214,160,0.7)) hue-rotate(120deg)',
            }} />
            <div style={{
              position: 'absolute', top: -18, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.7)', padding: '1px 6px', borderRadius: '3px',
              fontSize: '0.6rem', whiteSpace: 'nowrap', color: '#06d6a0',
              border: '1px solid rgba(6,214,160,0.4)',
            }}>{op.name}</div>
            <div style={{ position: 'absolute', bottom: -8, left: '10%', width: '80%' }}>
              <div style={{ background: 'rgba(0,0,0,0.7)', borderRadius: '3px', height: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#06d6a0', width: `${(op.hp/op.hpMax)*100}%` }}></div>
              </div>
            </div>
          </div>
        ))}

        {/* Death overlay */}
        {isDead && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ fontSize: '4rem', marginBottom: '10px' }}>💀</div>
            <h2 style={{ fontFamily: "'Cinzel', serif", color: '#ef476f', fontSize: '1.8rem', letterSpacing: '3px' }}>BẠN ĐÃ BỊ TIÊU DIỆT</h2>
            <p style={{ color: '#ffd166', marginTop: '10px', fontSize: '1.2rem' }}>
              Hồi sinh sau <span style={{ fontSize: '2rem', fontWeight: 'bold' }}>{deathTimer}</span> giây...
            </p>
          </div>
        )}

        {/* LOOT DROP OVERLAY */}
        {showLoot && lootDrop && !isDead && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 9,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              background: 'rgba(15,10,25,0.95)', border: '2px solid #ffd166',
              borderRadius: '16px', padding: '25px', maxWidth: '500px', width: '90%',
              boxShadow: '0 0 40px rgba(255,209,102,0.3)',
              animation: 'slideIn 0.5s ease-out',
            }}>
              <h3 style={{ textAlign: 'center', fontFamily: "'Cinzel', serif", color: '#ffd166', marginBottom: '15px', fontSize: '1.3rem', letterSpacing: '2px' }}>
                🎁 VẬT PHẨM RƠI
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
                {lootDrop.items.map((item, i) => (
                  <div key={item.id || i} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    background: 'rgba(255,255,255,0.05)', borderRadius: '10px',
                    padding: '10px 14px', border: `1px solid ${item.color}40`,
                    animation: `slideIn 0.3s ease-out ${i * 0.15}s both`,
                  }}>
                    <span style={{ fontSize: '1.8rem' }}>{item.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 'bold', color: item.color, fontSize: '0.95rem' }}>{item.name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', gap: '8px' }}>
                        <span style={{ color: item.color }}>{item.rarityLabel}</span>
                        <span>·</span>
                        <span>{item.type}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{
                textAlign: 'center', background: 'rgba(255,209,102,0.1)',
                padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,209,102,0.3)',
                marginBottom: '15px',
              }}>
                <span style={{ color: '#ffd166', fontWeight: 'bold', fontSize: '1.1rem' }}>
                  💰 +{lootDrop.gold.toLocaleString()} Vàng
                </span>
              </div>
              <button onClick={onCloseLoot} style={{
                width: '100%', padding: '10px', borderRadius: '8px',
                background: 'linear-gradient(45deg, #ffd166, #ff9f1c)', border: 'none',
                color: '#0b0914', fontWeight: 'bold', fontSize: '0.9rem',
                cursor: 'pointer', fontFamily: "'Cinzel', serif", letterSpacing: '1px',
              }}>
                NHẬN TẤT CẢ
              </button>
            </div>
          </div>
        )}

        {/* Attack range indicator */}
        {inRange && bossHp > 0 && !isDead && (
          <div style={{
            position: 'absolute', left: playerPos.x + PLAYER_SIZE/2 - 5, top: playerPos.y - 30,
            zIndex: 4, color: '#ffd166', fontSize: '0.75rem', fontWeight: 'bold',
            animation: 'pulse 1s infinite', whiteSpace: 'nowrap',
          }}>⚔️ Nhấn SPACE để tấn công!</div>
        )}

        {/* Controls hint */}
        <div style={{
          position: 'absolute', bottom: 10, left: 10, zIndex: 4,
          background: 'rgba(0,0,0,0.7)', padding: '8px 12px', borderRadius: '8px',
          fontSize: '0.75rem', color: 'var(--text-muted)',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 28px)', gap: '3px', textAlign: 'center' }}>
            <div></div>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '4px', padding: '2px' }}>W</div>
            <div></div>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '4px', padding: '2px' }}>A</div>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '4px', padding: '2px' }}>S</div>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '4px', padding: '2px' }}>D</div>
          </div>
          <div style={{ marginTop: '4px', textAlign: 'center', fontSize: '0.65rem' }}>Di chuyển</div>
        </div>

        {/* Zone name overlay */}
        <div style={{
          position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 4,
          background: 'rgba(0,0,0,0.7)', padding: '6px 20px', borderRadius: '20px',
          fontFamily: "'Cinzel', serif", color: assets.color, letterSpacing: '2px',
          border: `1px solid ${assets.color}50`,
        }}>{activeZone.name}</div>

        {/* Online badge */}
        <div style={{
          position: 'absolute', top: 10, right: 10, zIndex: 4,
          background: 'rgba(0,0,0,0.7)', padding: '4px 10px', borderRadius: '12px',
          fontSize: '0.75rem',
          color: activeZone.type === 'guild' ? '#06d6a0' : '#9d4edd',
        }}>
          {activeZone.type === 'guild' ? `🌐 ${playersInZone.length} online` : '🔒 Solo'}
        </div>
      </div>

      {/* Bottom UI panels */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', maxWidth: ARENA_W, margin: '0 auto', width: '100%' }}>

        {/* Boss info + Attack */}
        <div className="glass-panel" style={{ padding: '15px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <img src={assets.boss} alt="" style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: '8px' }} />
            <div>
              <h3 style={{ fontSize: '1rem', color: assets.color }}>{activeZone.boss.name}</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Lv {activeZone.boss.level} | {activeZone.boss.difficulty}</p>
            </div>
          </div>
          <div style={{ marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
              <span style={{ color: '#ef476f' }}>HP</span>
              <span>{bossHp.toLocaleString()} / {bossHpMax.toLocaleString()}</span>
            </div>
            <div className="progress-container" style={{ height: '10px' }}>
              <div className="progress-bar progress-hp" style={{ width: `${(bossHp/bossHpMax)*100}%` }}></div>
            </div>
          </div>
          <button className="btn-action" onClick={onAttack} disabled={bossHp <= 0 || isAttacking || !inRange || isDead}
            style={{ opacity: (bossHp <= 0 || isAttacking || !inRange || isDead) ? 0.4 : 1, padding: '10px', fontSize: '0.85rem', background: isDead ? '#555' : assets.color }}>
            <Sword size={16} />
            {isDead ? '💀 ĐÃ CHẾT — Đang hồi sinh...' : bossHp <= 0 ? 'BOSS ĐÃ BỊ TIÊU DIỆT' : !inRange ? 'Lại gần Boss để tấn công...' : 'TẤN CÔNG (SPACE)'}
          </button>
        </div>

        {/* Combat Log */}
        <div className="glass-panel" style={{ padding: '15px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', fontSize: '0.9rem' }}>
            <Activity size={16} color="var(--accent)" /> Combat Log
          </h3>
          <div className="combat-log" style={{ height: '140px' }}>
            {combatLogs.map(log => (
              <div key={log.id} className={`log-entry log-${log.type}`}>{log.text}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ====== MAIN APP ======
export default function App() {
  const [connected, setConnected] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  const [view, setView] = useState('login'); // 'login' | 'map' | 'combat'
  const [character, setCharacter] = useState(null);
  const [zones, setZones] = useState([]);
  const [activeZone, setActiveZone] = useState(null);

  // Auth state
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [bossHp, setBossHp] = useState(0);
  const [bossHpMax, setBossHpMax] = useState(1);
  const [bossStatus, setBossStatus] = useState('');
  const [playersInZone, setPlayersInZone] = useState([]);
  const [combatLogs, setCombatLogs] = useState([]);
  const [isAttacking, setIsAttacking] = useState(false);
  const [otherPlayers, setOtherPlayers] = useState({});
  const [initialPos, setInitialPos] = useState({ x: 150, y: 300 });
  const [isDead, setIsDead] = useState(false);
  const [deathTimer, setDeathTimer] = useState(0);
  const [lootDrop, setLootDrop] = useState(null); // { items: [], gold: 0 }
  const [showLoot, setShowLoot] = useState(false);
  const [bossPos, setBossPos] = useState({ x: 650, y: 120 });
  const [bossAttackingAnim, setBossAttackingAnim] = useState(false);

  const addLog = useCallback((text, type = 'system') => {
    setCombatLogs(prev => [{ id: Date.now() + Math.random(), text, type }, ...prev].slice(0, 50));
  }, []);

  useEffect(() => {
    socket.on('connect', () => {
      setConnected(true);
      // Send auth token if available
      const token = localStorage.getItem('aether_token');
      socket.emit('authenticate', { token });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('init', (data) => {
      setCharacter(data.player);
      setZones(data.zones);
      setOnlineCount(data.onlineCount);
      setIsLoggedIn(data.player.isLoggedIn || false);
      
      const hasToken = localStorage.getItem('aether_token');
      if (view === 'loading' || (view === 'login' && hasToken && data.player.isLoggedIn)) {
        setView('map');
      }
    });
    socket.on('online_count', (count) => setOnlineCount(count));
    socket.on('zone_entered', (data) => {
      setActiveZone(data.zone); setBossHp(data.bossHp); setBossHpMax(data.zone.boss.hpMax);
      setBossStatus(data.bossStatus); setPlayersInZone(data.playersInZone);
      setBossPos({ x: data.bossX !== undefined ? data.bossX : 650, y: data.bossY !== undefined ? data.bossY : 120 });
      setCharacter(prev => prev ? { ...prev, hp: data.player.hp, hpMax: data.player.hpMax } : prev);
      setInitialPos({ x: data.player.x || 150, y: data.player.y || 300 });
      // Load other players already in zone
      const others = {};
      if (data.otherPlayers) {
        data.otherPlayers.forEach(p => { others[p.name] = p; });
      }
      setOtherPlayers(others);
      setCombatLogs([{ id: Date.now(), text: `Bạn đã tiến vào ${data.zone.name}`, type: 'system' }]);
      setView('combat');
    });
    socket.on('player_joined_zone', (data) => {
      setPlayersInZone(data.playersInZone);
      setOtherPlayers(prev => ({ ...prev, [data.name]: { name: data.name, class: data.class, level: data.level, x: data.x, y: data.y, hp: data.hp || 48000, hpMax: data.hpMax || 48000 } }));
      addLog(`⚔️ ${data.name} đã tham gia!`, 'guild');
    });
    socket.on('player_left_zone', (data) => {
      setPlayersInZone(data.playersInZone || []);
      setOtherPlayers(prev => { const n = {...prev}; delete n[data.name]; return n; });
      addLog(`👋 ${data.name} đã rời.`, 'system');
    });
    socket.on('player_moved', (data) => {
      setOtherPlayers(prev => prev[data.name] ? { ...prev, [data.name]: { ...prev[data.name], x: data.x, y: data.y } } : prev);
    });
    socket.on('attack_result', (data) => {
      setBossHp(data.bossHp); setBossStatus(data.bossStatus);
      const isMe = data.attackerName === character?.name;
      addLog(`${isMe ? '[Bạn]' : `[${data.attackerName}]`} Gây ${data.damage.toLocaleString()} sát thương ${data.isCrit ? '(Chí mạng! 💥)' : ''}`, isMe ? 'player' : 'guild');
    });
    socket.on('boss_attacks_you', (data) => {
      setCharacter(prev => prev ? { ...prev, hp: data.playerHp } : prev);
      addLog(`[${data.bossName}] Tấn công gây ${data.damage.toLocaleString()} sát thương!`, 'boss');
    });
    socket.on('boss_moved', (data) => {
      setBossPos({ x: data.x, y: data.y });
    });
    socket.on('boss_attack_anim', () => {
      setBossAttackingAnim(true);
      setTimeout(() => setBossAttackingAnim(false), 800);
    });
    socket.on('player_dodged', (data) => {
      addLog(`✨ BẠN ĐÃ NÉ THÀNH CÔNG đòn tấn công của ${data.bossName}!`, 'player');
    });
    socket.on('boss_zone_attack', () => {});
    socket.on('boss_killed', (data) => {
      setBossStatus('Đã bị tiêu diệt'); setBossHp(0);
      addLog(`🏆 ${data.killerName} đã tiêu diệt ${data.bossName}!`, 'system');
      
      if (data.newLevel || data.levelUpInfo) {
        addLog(`🌟 CHÚC MỪNG! Bạn đã thăng cấp!`, 'system');
      }

      if (data.loot) {
        setLootDrop(data.loot);
        setShowLoot(true);
        data.loot.items.forEach(item => {
          addLog(`🎁 Vật phẩm rơi: ${item.icon} ${item.name} (${item.rarityLabel})`, 'guild');
        });
        addLog(`💰 Nhận được ${data.loot.gold.toLocaleString()} vàng!`, 'player');
        // Update character stats
        setCharacter(prev => prev ? {
          ...prev,
          level: data.newLevel || (data.levelUpInfo ? prev.level + 1 : prev.level),
          gold: (prev.gold || 0) + data.loot.gold,
          inventory: [...(prev.inventory || []), ...data.loot.items],
          bossKills: (prev.bossKills || 0) + 1
        } : prev);
        setTimeout(() => setShowLoot(false), 10000);
      }
    });
    socket.on('boss_respawned', (data) => { setBossHp(data.bossHp); setBossStatus('Đang hoạt động'); addLog(`🔥 ${data.bossName} đã hồi sinh!`, 'boss'); });

    // HP sync for other players
    socket.on('player_hp_update', (data) => {
      setOtherPlayers(prev => prev[data.name] ? { ...prev, [data.name]: { ...prev[data.name], hp: data.hp, hpMax: data.hpMax } } : prev);
    });

    // Death & Respawn
    socket.on('you_died', (data) => {
      setIsDead(true);
      setDeathTimer(5);
      addLog(`☠️ Bạn đã bị ${data.killedBy} tiêu diệt! Hồi sinh sau 5 giây...`, 'boss');
      // Countdown
      let t = 5;
      const interval = setInterval(() => { t--; setDeathTimer(t); if (t <= 0) clearInterval(interval); }, 1000);
    });
    socket.on('you_respawned', (data) => {
      setIsDead(false);
      setCharacter(prev => prev ? { ...prev, hp: data.hp, hpMax: data.hpMax } : prev);
      setInitialPos({ x: data.x, y: data.y });
      addLog(`✨ Bạn đã hồi sinh!`, 'system');
    });
    socket.on('player_died_in_zone', (data) => {
      setOtherPlayers(prev => prev[data.name] ? { ...prev, [data.name]: { ...prev[data.name], hp: 0, isDead: true } } : prev);
      addLog(`☠️ ${data.name} đã bị tiêu diệt!`, 'boss');
    });
    socket.on('player_respawned_in_zone', (data) => {
      setOtherPlayers(prev => prev[data.name] ? { ...prev, [data.name]: { ...prev[data.name], hp: data.hp, hpMax: data.hpMax, x: data.x, y: data.y, isDead: false } } : prev);
      addLog(`✨ ${data.name} đã hồi sinh!`, 'guild');
    });

    return () => { socket.removeAllListeners(); };
  }, [character?.name, addLog]);

  const enterZone = (zoneId) => socket.emit('enter_zone', zoneId);
  const exitZone = () => { socket.emit('leave_zone'); setView('map'); setActiveZone(null); setCombatLogs([]); setOtherPlayers({}); setShowLoot(false); setLootDrop(null); };
  const handleAttack = useCallback(() => {
    if (!activeZone || bossHp <= 0 || isAttacking || isDead) return;
    setIsAttacking(true);
    socket.emit('attack');
    setTimeout(() => setIsAttacking(false), 500);
  }, [activeZone, bossHp, isAttacking, isDead]);

  // Connect socket on mount
  useEffect(() => {
    socket.connect();
    return () => { socket.disconnect(); };
  }, []);

  // Auth handlers
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError(''); setAuthLoading(true);
    try {
      const endpoint = authMode === 'register' ? '/api/register' : '/api/login';
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) { setAuthError(data.error); setAuthLoading(false); return; }
      localStorage.setItem('aether_token', data.token);
      localStorage.setItem('aether_user', data.username);
      setIsLoggedIn(true);
      setView('loading');
      // Reconnect socket with token
      socket.disconnect();
      socket.connect();
      setAuthLoading(false);
    } catch (err) {
      setAuthError('Không thể kết nối server'); setAuthLoading(false);
    }
  };

  const handleGuest = () => {
    localStorage.removeItem('aether_token');
    localStorage.removeItem('aether_user');
    setView('loading');
    socket.disconnect();
    socket.connect();
  };

  const handleLogout = () => {
    localStorage.removeItem('aether_token');
    localStorage.removeItem('aether_user');
    setIsLoggedIn(false);
    setCharacter(null);
    setView('login');
    socket.disconnect();
    socket.connect();
  };

  // ====== LOGIN / REGISTER SCREEN ======
  if (view === 'login') {
    return (
      <div className="app-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div className="glass-panel" style={{ maxWidth: '420px', width: '100%', padding: '40px' }}>
          <h1 className="title-font" style={{ textAlign: 'center', background: 'linear-gradient(to right, #e0aaff, #9d4edd)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '8px', fontSize: '2.2rem' }}>AetherWorld</h1>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '30px', fontSize: '0.85rem' }}>
            {authMode === 'login' ? 'Đăng nhập để lưu tiến trình' : 'Tạo tài khoản mới'}
          </p>

          <form onSubmit={handleAuth}>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <User size={14} style={{ verticalAlign: 'middle' }} /> Tên tài khoản
              </label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                placeholder="Nhập tên tài khoản..."
                style={{
                  width: '100%', padding: '12px 15px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '0.95rem', outline: 'none',
                  boxSizing: 'border-box',
                }} />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <Lock size={14} style={{ verticalAlign: 'middle' }} /> Mật khẩu
              </label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu..."
                style={{
                  width: '100%', padding: '12px 15px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '0.95rem', outline: 'none',
                  boxSizing: 'border-box',
                }} />
            </div>

            {authError && <p style={{ color: '#ef476f', fontSize: '0.85rem', marginBottom: '15px', textAlign: 'center' }}>{authError}</p>}

            <button type="submit" disabled={authLoading} className="btn-action"
              style={{ width: '100%', padding: '12px', fontSize: '1rem', background: 'linear-gradient(45deg, #9d4edd, #e0aaff)', marginBottom: '10px' }}>
              <LogIn size={16} />
              {authLoading ? 'Đang xử lý...' : authMode === 'login' ? 'ĐĂNG NHẬP' : 'ĐĂNG KÝ'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '10px' }}>
            <button onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthError(''); }}
              style={{ background: 'none', border: 'none', color: '#e0aaff', cursor: 'pointer', fontSize: '0.85rem' }}>
              {authMode === 'login' ? 'Chưa có tài khoản? Đăng ký ngay' : 'Đã có tài khoản? Đăng nhập'}
            </button>
          </div>

          <div style={{ margin: '20px 0', borderTop: '1px solid rgba(255,255,255,0.1)', position: 'relative' }}>
            <span style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-card)', padding: '0 12px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>HOẶC</span>
          </div>

          <button onClick={handleGuest} className="btn-action"
            style={{ width: '100%', padding: '10px', fontSize: '0.9rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>
            <Globe size={16} /> CHƠI KHÁCH (không lưu dữ liệu)
          </button>
        </div>
      </div>
    );
  }

  // Loading screen
  if (!character || view === 'loading') {
    return (
      <div className="app-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div className="glass-panel" style={{ textAlign: 'center', padding: '60px' }}>
          <h1 className="title-font" style={{ background: 'linear-gradient(to right, #e0aaff, #9d4edd)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '20px' }}>AetherWorld</h1>
          <p style={{ color: 'var(--text-muted)' }}>{connected ? 'Đang tải thế giới...' : 'Đang kết nối tới máy chủ...'}</p>
          <div style={{ marginTop: '20px', width: '40px', height: '40px', border: '3px solid var(--primary)', borderTop: '3px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '20px auto' }}></div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="header">
        <div>
          <h1>AetherWorld</h1>
          <p style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {connected ? <Wifi size={14} color="var(--success)" /> : <WifiOff size={14} color="var(--danger)" />}
            {connected ? 'Đã kết nối' : 'Mất kết nối'}
            <span style={{ margin: '0 8px', color: 'rgba(255,255,255,0.2)' }}>|</span>
            <Globe size={14} /> {onlineCount} người chơi online
          </p>
        </div>
        <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src={PLAYER_IMG} alt="" style={{ width: 36, height: 36, objectFit: 'contain', filter: 'drop-shadow(0 0 5px rgba(157,78,221,0.6))' }} />
          <div>
            <h3 style={{ color: 'var(--secondary)', fontSize: '1rem' }}>{character.name}</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{character.race} {character.class} · Lv {character.level}</p>
            <p style={{ fontSize: '0.7rem', color: '#ffd166', marginTop: '2px' }}>
              💰 {(character.gold || 0).toLocaleString()} · 📦 {(character.inventory || []).length} vật phẩm · ⚔️ {character.bossKills || 0} boss
            </p>
          </div>
          {isLoggedIn ? (
            <button onClick={handleLogout} title="Đăng xuất" style={{ background: 'none', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: '#ef476f', fontSize: '0.75rem' }}>
              <LogOut size={14} /> Thoát
            </button>
          ) : (
            <span style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.1)', padding: '3px 8px', borderRadius: '6px', color: 'var(--text-muted)' }}>Khách</span>
          )}
        </div>
      </header>

      {/* MAP VIEW */}
      {view === 'map' && (
        <>
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <p style={{ color: 'var(--text-muted)' }}>Chọn khu vực để vào chiến đấu · Chia sẻ link cho bạn bè chơi cùng!</p>
          </div>
          <div className="map-container" style={{ minHeight: '550px' }}>
            <div className="map-grid"></div>
            <div className="zone-node" style={{ top: '48%', left: '50%' }} onClick={() => alert('Khu vực an toàn!')}>
              <div className="zone-icon-wrapper" style={{ borderColor: '#06d6a0', color: '#06d6a0' }}><Home size={32} color="#06d6a0" /></div>
              <div className="zone-label" style={{ color: '#06d6a0' }}>Thành Cổ Aether<div className="zone-type-badge" style={{ background: 'rgba(6,214,160,0.2)' }}>Safe Zone</div></div>
            </div>
            {zones.map(zone => {
              const a = ZONE_ASSETS[zone.id]; const pos = ZONE_POSITIONS[zone.id] || { top: '50%', left: '50%' };
              return (
                <div key={zone.id} className="zone-node" style={{ top: pos.top, left: pos.left }} onClick={() => enterZone(zone.id)}>
                  <div className="zone-icon-wrapper" style={{ borderColor: a?.color || '#fff', overflow: 'hidden' }}>
                    <img src={a?.boss} alt="" style={{ width: '90%', height: '90%', objectFit: 'contain' }} />
                  </div>
                  <div className="zone-label" style={{ color: a?.color || '#fff' }}>
                    {zone.name}
                    <div className="zone-type-badge" style={{ background: `${a?.color || '#fff'}33` }}>
                      {zone.type === 'solo' ? '🔒 Solo' : '🌐 Guild'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* COMBAT VIEW */}
      {view === 'combat' && activeZone && (
        <div>
          <button className="btn-back" onClick={exitZone} style={{ marginBottom: '15px' }}>
            <ArrowLeft size={18} /> Quay lại Bản đồ
          </button>
          <GameArena
            activeZone={activeZone} bossHp={bossHp} bossHpMax={bossHpMax} bossStatus={bossStatus}
            character={character} onAttack={handleAttack} isAttacking={isAttacking}
            playersInZone={playersInZone} combatLogs={combatLogs}
            otherPlayersMap={otherPlayers} initialPos={initialPos}
            isDead={isDead} deathTimer={deathTimer}
            lootDrop={lootDrop} showLoot={showLoot} onCloseLoot={() => setShowLoot(false)}
            bossPos={bossPos} bossAttackingAnim={bossAttackingAnim}
          />
        </div>
      )}
    </div>
  );
}
