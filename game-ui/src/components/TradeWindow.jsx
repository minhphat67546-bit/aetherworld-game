import React, { useState, useEffect } from 'react';
import { Package, X, Check, RefreshCw } from 'lucide-react';

export default function TradeWindow({ socket, tradeState, character, onClose }) {
  const [offerGold, setOfferGold] = useState(0);
  const [offerItems, setOfferItems] = useState([]); // mảng tên vật phẩm

  // Khi tradeState cập nhật (do mình hoặc đối tác offer)
  useEffect(() => {
    if (tradeState?.myReady) {
      // Đã ready thì không sửa nữa
    }
  }, [tradeState]);

  if (!tradeState || !tradeState.tradeId) return null;

  const toggleItem = (itemName) => {
    if (tradeState.myReady) return;
    setOfferItems(prev => {
      const newItems = prev.includes(itemName) 
        ? prev.filter(i => i !== itemName)
        : [...prev, itemName];
      
      // Emit ngay khi có thay đổi
      socket.emit('trade_offer', { items: newItems, gold: offerGold });
      return newItems;
    });
  };

  const handleGoldChange = (e) => {
    if (tradeState.myReady) return;
    const val = parseInt(e.target.value) || 0;
    const clamped = Math.min(Math.max(0, val), character.gold || 0);
    setOfferGold(clamped);
    socket.emit('trade_offer', { items: offerItems, gold: clamped });
  };

  const handleReady = () => {
    socket.emit('trade_ready');
  };

  const handleCancel = () => {
    socket.emit('trade_cancel');
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        background: 'rgba(15,10,25,0.95)', border: '2px solid #9d4edd', borderRadius: '16px',
        width: '800px', maxWidth: '95vw', padding: '20px', boxShadow: '0 0 50px rgba(157,78,221,0.3)',
        display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '15px', marginBottom: '20px' }}>
          <h2 style={{ fontFamily: "'Cinzel', serif", color: '#e0aaff', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <RefreshCw size={24} /> GIAO DỊCH VỚI {tradeState.partnerName}
          </h2>
          <button onClick={handleCancel} style={{ background: 'none', border: 'none', color: '#ef476f', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: '20px' }}>
          {/* Cột Trái: Của mình */}
          <div style={{ flex: 1, borderRight: '1px solid rgba(255,255,255,0.1)', paddingRight: '20px' }}>
            <h3 style={{ color: tradeState.myReady ? '#06d6a0' : '#fff', textAlign: 'center', marginBottom: '15px' }}>
              PHẦN CỦA BẠN {tradeState.myReady && '(ĐÃ KHÓA)'}
            </h3>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '5px' }}>Vàng đưa ra:</label>
              <input 
                type="number" value={offerGold} onChange={handleGoldChange}
                disabled={tradeState.myReady}
                style={{
                  width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid rgba(255,209,102,0.5)',
                  background: 'rgba(0,0,0,0.5)', color: '#ffd166', fontSize: '1rem', outline: 'none'
                }}
              />
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', textAlign: 'right' }}>
                Đang có: {(character.gold || 0).toLocaleString()}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '5px' }}>Túi đồ (Click để đưa vào GD):</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                {(character.inventory || []).map((item, i) => {
                  const isOffered = offerItems.includes(item.name);
                  return (
                    <div key={i} onClick={() => toggleItem(item.name)} style={{
                      aspectRatio: '1', background: isOffered ? 'rgba(157,78,221,0.3)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${isOffered ? '#9d4edd' : 'rgba(255,255,255,0.1)'}`,
                      borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      cursor: tradeState.myReady ? 'not-allowed' : 'pointer', filter: tradeState.myReady && !isOffered ? 'grayscale(1) opacity(0.3)' : 'none'
                    }}>
                      <span style={{ fontSize: '1.5rem' }}>{item.icon}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Cột Phải: Của đối tác */}
          <div style={{ flex: 1, paddingLeft: '20px' }}>
             <h3 style={{ color: tradeState.partnerReady ? '#06d6a0' : '#fff', textAlign: 'center', marginBottom: '15px' }}>
              {tradeState.partnerName} {tradeState.partnerReady ? '(ĐÃ KHÓA)' : '(ĐANG CHỌN...)'}
            </h3>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '5px' }}>Vàng nhận được:</label>
              <div style={{
                  width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(0,0,0,0.3)', color: '#ffd166', fontSize: '1rem', textAlign: 'center'
              }}>
                {tradeState.partnerGold.toLocaleString()}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '5px' }}>Vật phẩm nhận được:</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', minHeight: '100px', background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px' }}>
                {tradeState.partnerItems.length === 0 ? (
                  <span style={{ color: 'rgba(255,255,255,0.2)', fontStyle: 'italic', fontSize: '0.85rem' }}>Chưa có vật phẩm nào...</span>
                ) : (
                  tradeState.partnerItems.map((itemName, i) => (
                    <div key={i} style={{ background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem', color: '#fff' }}>
                      {itemName}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '25px', display: 'flex', gap: '15px', justifyContent: 'center' }}>
          <button className="btn-action" onClick={handleReady} disabled={tradeState.myReady} style={{
            background: tradeState.myReady ? '#555' : '#06d6a0', color: '#fff', padding: '12px 30px',
            fontSize: '1.1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', cursor: tradeState.myReady ? 'not-allowed' : 'pointer'
          }}>
            <Check size={20} /> {tradeState.myReady ? 'ĐÃ SẴN SÀNG' : 'XÁC NHẬN GIAO DỊCH'}
          </button>
        </div>
        
        {tradeState.myReady && !tradeState.partnerReady && (
          <p style={{ textAlign: 'center', color: '#ffd166', fontSize: '0.85rem', marginTop: '10px' }}>
            Đang chờ {tradeState.partnerName} xác nhận...
          </p>
        )}
      </div>
    </div>
  );
}
