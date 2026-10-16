const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const rooms = new Map();

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true }));

function cleanName(value) {
  return String(value || '').trim().replace(/[<>]/g, '').slice(0, 12);
}

function roomCode() {
  let code;
  do code = String(Math.floor(1000 + Math.random() * 9000)); while (rooms.has(code));
  return code;
}

function publicRoom(room) {
  return {
    code: room.code,
    status: room.status,
    round: room.round,
    hostId: room.hostId,
    turnIndex: room.turnIndex,
    players: room.players.map(({ id, name, cap, distance, finished, connected }) => ({
      id, name, cap, distance, finished, connected
    }))
  };
}

function broadcast(room) {
  io.to(room.code).emit('room:update', publicRoom(room));
}

function fail(socket, message) {
  socket.emit('game:error', message);
}

io.on('connection', socket => {
  socket.on('room:create', ({ name, cap } = {}) => {
    name = cleanName(name);
    if (!name) return fail(socket, '이름을 입력해 주세요.');
    const code = roomCode();
    const player = { id: socket.id, name, cap, distance: null, finished: false, connected: true };
    const room = { code, hostId: socket.id, status: 'lobby', round: 1, turnIndex: 0, players: [player] };
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    broadcast(room);
  });

  socket.on('room:join', ({ code, name, cap } = {}) => {
    code = String(code || '').trim();
    name = cleanName(name);
    const room = rooms.get(code);
    if (!room) return fail(socket, '방을 찾을 수 없어요. 핀 번호를 확인해 주세요.');
    if (room.status !== 'lobby') return fail(socket, '이미 게임이 시작된 방이에요.');
    if (!name) return fail(socket, '이름을 입력해 주세요.');
    if (room.players.length >= 8) return fail(socket, '이 방은 가득 찼어요.');
    if (room.players.some(p => p.name === name)) return fail(socket, '이미 사용 중인 이름이에요.');
    room.players.push({ id: socket.id, name, cap, distance: null, finished: false, connected: true });
    socket.join(code);
    socket.data.roomCode = code;
    broadcast(room);
  });

  socket.on('game:start', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id) return fail(socket, '방장만 시작할 수 있어요.');
    if (room.players.length < 2) return fail(socket, '두 명 이상 모여야 시작할 수 있어요.');
    room.status = 'playing';
    room.turnIndex = 0;
    room.players.forEach(p => { p.distance = null; p.finished = false; });
    broadcast(room);
  });

  socket.on('game:flick', ({ power } = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing') return;
    const player = room.players[room.turnIndex];
    if (!player || player.id !== socket.id || player.finished) return fail(socket, '지금은 내 차례가 아니에요.');
    power = Math.max(0.08, Math.min(1, Number(power) || 0));
    player.distance = power * 125;
    player.finished = true;
    const duration = Math.round(1400 - power * 820);
    room.status = 'flying';
    io.to(room.code).emit('game:flicked', { playerId: player.id, power, distance: player.distance, duration });
    const round = room.round;
    setTimeout(() => {
      if (rooms.get(room.code) !== room || room.round !== round || room.status !== 'flying') return;
      const next = room.players.findIndex(p => !p.finished);
      room.turnIndex = next < 0 ? room.players.length : next;
      room.status = next < 0 ? 'finished' : 'playing';
      broadcast(room);
    }, duration + 120);
  });

  socket.on('game:restart', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id) return fail(socket, '방장만 다시 시작할 수 있어요.');
    room.status = 'playing';
    room.round += 1;
    room.turnIndex = 0;
    room.players.forEach(p => { p.distance = null; p.finished = false; });
    broadcast(room);
  });

  socket.on('game:end', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id) return fail(socket, '방장만 게임을 종료할 수 있어요.');
    io.to(room.code).emit('game:ended');
    rooms.delete(room.code);
  });

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    room.players = room.players.filter(p => p.id !== socket.id);
    if (!room.players.length) return rooms.delete(room.code);
    if (room.hostId === socket.id) room.hostId = room.players[0].id;
    if (room.status === 'playing') {
      room.turnIndex = Math.min(room.turnIndex, room.players.length - 1);
      if (room.players.every(p => p.finished)) room.status = 'finished';
    }
    broadcast(room);
  });
});

const port = process.env.PORT || 3000;
server.listen(port, '0.0.0.0', () => console.log(`Bottle cap game listening on ${port}`));

module.exports = { server };
