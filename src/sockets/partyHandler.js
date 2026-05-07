const { players, parties, counters } = require('../state/gameState');

function registerPartyHandlers(io, socket) {
  socket.on('party_invite', (targetName) => {
    const player = players.get(socket.id);
    if (!player) return;
    
    let targetSocketId = null;
    players.forEach((p, sid) => { if (p.name === targetName && sid !== socket.id) targetSocketId = sid; });

    if (!targetSocketId) return socket.emit('sys_msg', { msg: 'Không tìm thấy người chơi này.' });
    io.to(targetSocketId).emit('party_invite_received', { from: player.name, fromId: socket.id });
  });

  socket.on('party_accept', (fromId) => {
    const player = players.get(socket.id);
    const inviter = players.get(fromId);
    if (!player || !inviter) return;

    let partyId = inviter.partyId;
    if (!partyId) {
      partyId = 'party_' + (counters.partyId++);
      inviter.partyId = partyId;
      parties.set(partyId, { id: partyId, leader: fromId, members: [fromId] });
    }

    const party = parties.get(partyId);
    if (party.members.length >= 5) return socket.emit('sys_msg', { msg: 'Tổ đội đã đầy!' });
    if (party.members.includes(socket.id)) return;

    player.partyId = partyId;
    party.members.push(socket.id);

      party.members.forEach(mId => {
        io.to(mId).emit('party_update', { 
          partyId, members: party.members.map(id => {
              const p = players.get(id);
              if (!p) return null;
              return { name: p.name, level: p.level, class: p.class, hp: p.hp, hpMax: p.hpMax };
          }).filter(Boolean)
        });
      });
  });

  socket.on('party_leave', () => {
    const player = players.get(socket.id);
    if (!player || !player.partyId) return;
    const party = parties.get(player.partyId);
    if (party) {
      party.members = party.members.filter(id => id !== socket.id);
      player.partyId = null;
      if (party.members.length === 0) {
        parties.delete(party.id);
      } else {
        if (party.leader === socket.id) party.leader = party.members[0];
        party.members.forEach(mId => {
          io.to(mId).emit('party_update', { 
            partyId: party.id, members: party.members.map(id => {
                const p = players.get(id);
                if (!p) return null;
                return { name: p.name, level: p.level, class: p.class, hp: p.hp, hpMax: p.hpMax };
            }).filter(Boolean)
          });
        });
      }
    }
    socket.emit('party_update', null);
  });
}

module.exports = registerPartyHandlers;
