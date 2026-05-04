import React, { useState } from 'react';
import { Users, UserPlus, X, LogOut, Shield } from 'lucide-react';

export default function PartyFrame({ socket, character, playersInZone, partyState }) {
  const [inviteName, setInviteName] = useState('');
  const [showInviteBox, setShowInviteBox] = useState(false);

  const handleInvite = (e) => {
    e.preventDefault();
    if (!inviteName.trim()) return;
    socket.emit('party_invite', inviteName.trim());
    setInviteName('');
    setShowInviteBox(false);
    // Có thể thêm log thông báo cục bộ ở đây
  };

  const handleLeave = () => {
    socket.emit('party_leave');
  };

  // Nút hiển thị nếu chưa có tổ đội
  if (!partyState || !partyState.partyId) {
    return (
      <div style={{ position: 'fixed', left: '20px', top: '80px', zIndex: 100 }}>
        <button 
          onClick={() => setShowInviteBox(!showInviteBox)}
          style={{
            background: 'rgba(0,0,0,0.7)', border: '1px solid #9d4edd', borderRadius: '8px',
            padding: '8px 12px', color: '#e0aaff', display: 'flex', alignItems: 'center', gap: '8px',
            cursor: 'pointer', fontFamily: "'Cinzel', serif"
          }}
        >
          <Users size={16} /> TẠO TỔ ĐỘI
        </button>

        {showInviteBox && (
          <form onSubmit={handleInvite} style={{
            marginTop: '10px', background: 'rgba(15,10,25,0.9)', border: '1px solid rgba(157,78,221,0.5)',
            padding: '10px', borderRadius: '8px', display: 'flex', gap: '5px',
            boxShadow: '0 0 15px rgba(0,0,0,0.5)'
          }}>
            <input 
              value={inviteName} onChange={e => setInviteName(e.target.value)}
              placeholder="Tên người chơi..."
              style={{
                background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: 'white',
                padding: '6px', borderRadius: '4px', outline: 'none', width: '120px'
              }}
            />
            <button type="submit" style={{
              background: '#9d4edd', border: 'none', borderRadius: '4px', color: 'white',
              padding: '6px 10px', cursor: 'pointer'
            }}><UserPlus size={14} /></button>
          </form>
        )}
      </div>
    );
  }

  // Khung Tổ đội khi đã có đội
  return (
    <div style={{
      position: 'fixed', left: '20px', top: '80px', zIndex: 100,
      background: 'rgba(15,10,25,0.85)', border: '1px solid #06d6a0', borderRadius: '8px',
      padding: '10px', minWidth: '180px', boxShadow: '0 0 20px rgba(6,214,160,0.2)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(6,214,160,0.3)', paddingBottom: '8px', marginBottom: '8px' }}>
        <span style={{ fontFamily: "'Cinzel', serif", color: '#06d6a0', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Shield size={16} /> TỔ ĐỘI ({partyState.members.length}/5)
        </span>
        <button onClick={handleLeave} style={{ background: 'none', border: 'none', color: '#ef476f', cursor: 'pointer' }} title="Rời đội">
          <LogOut size={16} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {partyState.members.map((memberName, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'rgba(255,255,255,0.05)', padding: '6px 10px', borderRadius: '4px',
            color: memberName === character.name ? '#ffd166' : '#fff'
          }}>
            <Users size={12} color={memberName === character.name ? '#ffd166' : '#var(--text-muted)'} />
            <span style={{ fontSize: '0.85rem' }}>{memberName} {memberName === character.name && '(Bạn)'}</span>
          </div>
        ))}
      </div>

      {partyState.members.length < 5 && (
        <form onSubmit={handleInvite} style={{ display: 'flex', gap: '5px', marginTop: '10px' }}>
           <input 
              value={inviteName} onChange={e => setInviteName(e.target.value)}
              placeholder="Mời thêm..."
              style={{
                background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: 'white',
                padding: '4px 6px', borderRadius: '4px', outline: 'none', width: '100%', fontSize: '0.75rem'
              }}
            />
            <button type="submit" style={{
              background: 'transparent', border: '1px solid #06d6a0', borderRadius: '4px', color: '#06d6a0',
              padding: '4px 6px', cursor: 'pointer'
            }}><UserPlus size={12} /></button>
        </form>
      )}
    </div>
  );
}
