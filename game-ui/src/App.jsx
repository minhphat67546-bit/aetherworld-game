import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { Shield, Sword, Skull, Crown, Activity, ArrowLeft, Users, User, Home, Wifi, WifiOff, Globe } from 'lucide-react';

// Connect to the backend server
const SOCKET_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : window.location.origin;

const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });

// Zone icon mapping
const ZONE_CONFIG = {
  forest: { icon: <User size={32} />, color: '#2d6a4f' },
  volcano: { icon: <Users size={32} />, color: '#ef476f' },
  ocean:   { icon: <Users size={32} />, color: '#0077b6' },
  tower:   { icon: <User size={32} />, color: '#9d4edd' },
};

const ZONE_POSITIONS = {
  forest:  { top: '25%', left: '55%' },
  volcano: { top: '65%', left: '75%' },
  ocean:   { top: '70%', left: '30%' },
  tower:   { top: '25%', left: '25%' },
};

export default function App() {
  const [connected, setConnected] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  const [view, setView] = useState('map');

  const [character, setCharacter] = useState(null);
  const [zones, setZones] = useState([]);

  const [activeZone, setActiveZone] = useState(null);
  const [bossHp, setBossHp] = useState(0);
  const [bossHpMax, setBossHpMax] = useState(1);
  const [bossStatus, setBossStatus] = useState('');
  const [playersInZone, setPlayersInZone] = useState([]);

  const [combatLogs, setCombatLogs] = useState([]);
  const [isAttacking, setIsAttacking] = useState(false);

  const logRef = useRef(null);

  const addLog = useCallback((text, type = 'system') => {
    setCombatLogs(prev => [{ id: Date.now() + Math.random(), text, type }, ...prev].slice(0, 50));
  }, []);

  // ---- Socket event handlers ----
  useEffect(() => {
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('init', (data) => {
      setCharacter(data.player);
      setZones(data.zones);
      setOnlineCount(data.onlineCount);
    });

    socket.on('online_count', (count) => setOnlineCount(count));

    socket.on('zone_entered', (data) => {
      setActiveZone(data.zone);
      setBossHp(data.bossHp);
      setBossHpMax(data.zone.boss.hpMax);
      setBossStatus(data.bossStatus);
      setPlayersInZone(data.playersInZone);
      setCharacter(prev => prev ? { ...prev, hp: data.player.hp, hpMax: data.player.hpMax } : prev);
      setCombatLogs([{ id: Date.now(), text: `Bạn đã tiến vào ${data.zone.name}`, type: 'system' }]);
      setView('combat');
    });

    socket.on('player_joined_zone', (data) => {
      setPlayersInZone(data.playersInZone);
      addLog(`⚔️ ${data.name} đã tham gia khu vực!`, 'guild');
    });

    socket.on('player_left_zone', (data) => {
      setPlayersInZone(data.playersInZone);
      addLog(`👋 ${data.name} đã rời khu vực.`, 'system');
    });

    socket.on('attack_result', (data) => {
      setBossHp(data.bossHp);
      setBossStatus(data.bossStatus);
      const isMe = data.attackerName === character?.name;
      const type = isMe ? 'player' : 'guild';
      const prefix = isMe ? '[Bạn]' : `[${data.attackerName}]`;
      addLog(`${prefix} Gây ${data.damage.toLocaleString()} sát thương ${data.isCrit ? '(Chí mạng! 💥)' : ''}`, type);
    });

    socket.on('boss_attacks_you', (data) => {
      setCharacter(prev => prev ? { ...prev, hp: data.playerHp } : prev);
      addLog(`[${data.bossName}] Tấn công bạn gây ${data.damage.toLocaleString()} sát thương!`, 'boss');
    });

    socket.on('boss_zone_attack', (data) => {
      // Already handled by boss_attacks_you for damage, this is just visual
    });

    socket.on('boss_killed', (data) => {
      setBossStatus('Đã bị tiêu diệt');
      setBossHp(0);
      addLog(`🏆 ${data.killerName} đã tiêu diệt ${data.bossName}! Boss sẽ hồi sinh sau 15 giây...`, 'system');
    });

    socket.on('boss_respawned', (data) => {
      setBossHp(data.bossHp);
      setBossStatus('Đang hoạt động');
      addLog(`🔥 ${data.bossName} đã hồi sinh! Sẵn sàng chiến đấu!`, 'boss');
    });

    return () => { socket.removeAllListeners(); };
  }, [character?.name, addLog]);

  const enterZone = (zoneId) => {
    socket.emit('enter_zone', zoneId);
  };

  const exitZone = () => {
    socket.emit('leave_zone');
    setView('map');
    setActiveZone(null);
    setCombatLogs([]);
  };

  const handleAttack = () => {
    if (!activeZone || bossHp <= 0 || isAttacking) return;
    setIsAttacking(true);
    socket.emit('attack');
    setTimeout(() => setIsAttacking(false), 600);
  };

  if (!character) {
    return (
      <div className="app-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div className="glass-panel" style={{ textAlign: 'center', padding: '60px' }}>
          <h1 className="title-font" style={{ background: 'linear-gradient(to right, #e0aaff, #9d4edd)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '20px' }}>
            AetherWorld
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>
            {connected ? 'Đang tải thế giới...' : 'Đang kết nối tới máy chủ...'}
          </p>
          <div style={{ marginTop: '20px', width: '40px', height: '40px', border: '3px solid var(--primary)', borderTop: '3px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '20px auto' }}></div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* HEADER */}
      <header className="header">
        <div>
          <h1>AetherWorld</h1>
          <p style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {connected ? <Wifi size={14} color="var(--success)" /> : <WifiOff size={14} color="var(--danger)" />}
            {connected ? 'Đã kết nối' : 'Mất kết nối'}
            <span style={{ margin: '0 8px', color: 'rgba(255,255,255,0.2)' }}>|</span>
            <Globe size={14} /> {onlineCount} người chơi đang online
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--secondary)' }}>
            <Shield size={20} /> {character.name}
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {character.race} {character.class} · Lv {character.level} · CR {character.combatRating.toLocaleString()}
          </p>
        </div>
      </header>

      {/* ===== MAP VIEW ===== */}
      {view === 'map' && (
        <>
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <p style={{ color: 'var(--text-muted)' }}>Chọn một khu vực để vào chiến đấu. Chia sẻ đường link cho bạn bè để chơi cùng!</p>
          </div>
          <div className="map-container" style={{ minHeight: '550px' }}>
            <div className="map-grid"></div>

            {/* Safe zone */}
            <div className="zone-node" style={{ top: '48%', left: '50%' }} onClick={() => alert('Đây là khu vực an toàn!')}>
              <div className="zone-icon-wrapper" style={{ borderColor: '#06d6a0', color: '#06d6a0' }}>
                <Home size={32} color="#06d6a0" />
              </div>
              <div className="zone-label" style={{ color: '#06d6a0' }}>
                Thành Cổ Aether
                <div className="zone-type-badge" style={{ background: 'rgba(6,214,160,0.2)' }}>Safe Zone</div>
              </div>
            </div>

            {/* Dynamic zones from server */}
            {zones.map(zone => {
              const cfg = ZONE_CONFIG[zone.id] || { icon: <Skull size={32} />, color: '#ff006e' };
              const pos = ZONE_POSITIONS[zone.id] || { top: '50%', left: '50%' };
              return (
                <div key={zone.id} className="zone-node" style={{ top: pos.top, left: pos.left }} onClick={() => enterZone(zone.id)}>
                  <div className="zone-icon-wrapper" style={{ borderColor: cfg.color, color: cfg.color }}>
                    {React.cloneElement(cfg.icon, { color: cfg.color })}
                  </div>
                  <div className="zone-label" style={{ color: cfg.color }}>
                    {zone.name}
                    <div className="zone-type-badge" style={{ background: `${cfg.color}33` }}>
                      {zone.type === 'solo' ? '🔒 Offline Solo' : '🌐 Online Guild'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ===== COMBAT VIEW ===== */}
      {view === 'combat' && activeZone && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <button className="btn-back" onClick={exitZone}>
              <ArrowLeft size={18} /> Quay lại Bản đồ
            </button>
            {activeZone.type === 'guild' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success)', fontSize: '0.9rem' }}>
                <Users size={16} /> {playersInZone.length} người đang trong khu vực
              </div>
            )}
          </div>

          <div className="dashboard-grid">

            {/* Boss Panel */}
            <div className="glass-panel" style={{ border: `1px solid ${ZONE_CONFIG[activeZone.id]?.color || '#ff006e'}`, gridColumn: 'span 2' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h2 className="title-font" style={{ display: 'flex', alignItems: 'center', gap: '10px', color: ZONE_CONFIG[activeZone.id]?.color || '#ff006e' }}>
                  <Skull /> {activeZone.name}
                </h2>
                <span className="badge" style={{
                  background: activeZone.type === 'guild' ? 'rgba(6,214,160,0.2)' : 'rgba(157,78,221,0.2)',
                  color: activeZone.type === 'guild' ? 'var(--success)' : 'var(--primary)',
                  border: `1px solid ${activeZone.type === 'guild' ? 'var(--success)' : 'var(--primary)'}`
                }}>
                  {activeZone.type === 'guild' ? '🌐 ONLINE MULTIPLAYER' : '🔒 OFFLINE SOLO'}
                </span>
              </div>

              <div style={{ textAlign: 'center', margin: '25px 0' }}>
                <h3 style={{ fontSize: '1.8rem', color: 'var(--text-main)' }}>{activeZone.boss.name}</h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: '15px' }}>Lv {activeZone.boss.level} | {activeZone.boss.difficulty}</p>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '8px' }}>
                    <span style={{ color: ZONE_CONFIG[activeZone.id]?.color, fontWeight: 'bold' }}>HP Boss</span>
                    <span>{bossHpMax > 0 ? ((bossHp / bossHpMax) * 100).toFixed(1) : 0}%</span>
                  </div>
                  <div className="progress-container" style={{ height: '16px' }}>
                    <div className="progress-bar" style={{
                      background: ZONE_CONFIG[activeZone.id]?.color || '#ef476f',
                      width: `${bossHpMax > 0 ? (bossHp / bossHpMax) * 100 : 0}%`
                    }}></div>
                  </div>
                  <p style={{ marginTop: '8px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    {bossHp.toLocaleString()} / {bossHpMax.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Players in zone (guild mode) */}
              {activeZone.type === 'guild' && playersInZone.length > 0 && (
                <div style={{ marginBottom: '15px', padding: '10px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px' }}>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Đồng đội trong khu vực:</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {playersInZone.map(name => (
                      <span key={name} style={{
                        fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px',
                        background: name === character.name ? 'rgba(157,78,221,0.3)' : 'rgba(255,255,255,0.08)',
                        border: name === character.name ? '1px solid var(--primary)' : '1px solid rgba(255,255,255,0.1)',
                        color: name === character.name ? 'var(--secondary)' : 'var(--text-muted)'
                      }}>
                        {name === character.name ? `${name} (Bạn)` : name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <button
                className="btn-action"
                onClick={handleAttack}
                disabled={bossHp <= 0 || isAttacking}
                style={{
                  opacity: (bossHp <= 0 || isAttacking) ? 0.5 : 1,
                  background: bossHp <= 0 ? '#333' : (ZONE_CONFIG[activeZone.id]?.color || 'var(--primary)')
                }}
              >
                <Sword size={20} />
                {bossHp <= 0 ? 'BOSS ĐÃ BỊ TIÊU DIỆT — Đang hồi sinh...' : 'TẤN CÔNG'}
              </button>
            </div>

            {/* Right side: Character + Combat Log */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="glass-panel" style={{ padding: '15px' }}>
                <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px', marginBottom: '10px', fontSize: '1rem' }}>
                  {character.name}
                </h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '5px' }}>
                  <span style={{ color: '#ef476f' }}>HP</span>
                  <span>{character.hp.toLocaleString()} / {character.hpMax.toLocaleString()}</span>
                </div>
                <div className="progress-container">
                  <div className="progress-bar progress-hp" style={{ width: `${(character.hp / character.hpMax) * 100}%` }}></div>
                </div>
              </div>

              <div className="glass-panel" style={{ flex: 1, padding: '15px' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px', fontSize: '1rem' }}>
                  <Activity size={18} color="var(--accent)" /> Combat Log
                </h3>
                <div className="combat-log" ref={logRef}>
                  {combatLogs.map(log => (
                    <div key={log.id} className={`log-entry log-${log.type}`}>
                      {log.text}
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
