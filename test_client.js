const { io } = require('socket.io-client');
const socket = io('http://localhost:3001');

socket.on('connect', () => {
  console.log('Connected!');
  socket.emit('authenticate', { token: null });
});

socket.on('init', (data) => {
  console.log('Init received:', data.player.name);
  socket.disconnect();
});

socket.on('connect_error', (err) => {
  console.error('Connection error:', err.message);
});
