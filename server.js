const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { HebrewDictionary } = require('./src/dictionary');
const { GameManager } = require('./src/gameManager');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const dictionary = new HebrewDictionary();
dictionary.load(path.join(__dirname, 'data'));

const gameManager = new GameManager(io, dictionary);

app.use(express.static(path.join(__dirname, 'public')));

// API for room list and stats
app.get('/api/lobby', (req, res) => {
  res.json({
    stats: gameManager.getStats(),
    rooms: gameManager.getPublicRooms(),
    dictionarySize: dictionary.allWords.size,
  });
});

// Serve index.html for 4-letter room URLs like /ABCD
app.get('/:code', (req, res, next) => {
  const code = req.params.code;
  if (/^[A-Za-z0-9]{4}$/.test(code)) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

io.on('connection', (socket) => {
  let currentRoomCode = null;

  socket.on('createRoom', ({ name, isPublic, nickname }, cb) => {
    const room = gameManager.createRoom({
      name,
      isPublic,
      hostSocketId: socket.id,
      hostNickname: nickname,
    });
    gameManager.joinRoom(room.code, socket.id, nickname);
    socket.join(room.code);
    currentRoomCode = room.code;
    if (cb) cb({ ok: true, code: room.code });
    gameManager.broadcastRoomState(room);
    io.emit('lobbyUpdated');
  });

  socket.on('joinRoom', ({ code, nickname }, cb) => {
    const cleanCode = (code || '').trim().toUpperCase();
    const room = gameManager.joinRoom(cleanCode, socket.id, nickname);
    if (!room) {
      if (cb) cb({ ok: false, error: 'החדר לא נמצא' });
      return;
    }
    socket.join(room.code);
    currentRoomCode = room.code;
    if (cb) cb({ ok: true, code: room.code });
    gameManager.broadcastRoomState(room);
    io.emit('lobbyUpdated');
  });

  socket.on('leaveRoom', () => {
    if (currentRoomCode) {
      socket.leave(currentRoomCode);
      gameManager.leaveRoom(currentRoomCode, socket.id);
      currentRoomCode = null;
      io.emit('lobbyUpdated');
    }
  });

  socket.on('joinSeat', () => {
    const room = gameManager.rooms.get(currentRoomCode);
    if (!room) return;
    gameManager.seatPlayer(room, socket.id);
    gameManager.broadcastRoomState(room);
  });

  socket.on('leaveSeat', () => {
    const room = gameManager.rooms.get(currentRoomCode);
    if (!room) return;
    gameManager.unseatPlayer(room, socket.id);
    gameManager.broadcastRoomState(room);
  });

  socket.on('toggleAutoJoin', (val) => {
    const room = gameManager.rooms.get(currentRoomCode);
    if (!room) return;
    const p = room.players.get(socket.id);
    if (p) {
      p.autoJoin = Boolean(val);
      gameManager.broadcastRoomState(room);
    }
  });

  socket.on('addBot', (payload) => {
    const room = gameManager.rooms.get(currentRoomCode);
    if (!room || room.hostId !== socket.id) return;
    const level = payload && typeof payload === 'object' ? payload.level : 'medium';
    gameManager.addBot(room, level);
  });

  socket.on('removeBots', () => {
    const room = gameManager.rooms.get(currentRoomCode);
    if (!room || room.hostId !== socket.id) return;
    gameManager.removeBots(room);
  });

  socket.on('setRulesOpen', (open) => {
    const room = gameManager.rooms.get(currentRoomCode);
    if (!room || room.hostId !== socket.id) return;
    room.rulesOpen = Boolean(open);
    gameManager.evaluateLobbyCountdown(room);
    gameManager.broadcastRoomState(room);
  });

  socket.on('updateRules', (newRules) => {
    const room = gameManager.rooms.get(currentRoomCode);
    if (!room || room.hostId !== socket.id || room.phase !== 'lobby') return;
    room.rules = {
      ...room.rules,
      ...newRules,
      minTurnDuration: Math.min(10, Math.max(1, Number(newRules.minTurnDuration) || 5)),
      maxPromptAge: Math.min(16, Math.max(1, Number(newRules.maxPromptAge) || 2)),
      startingLives: Math.min(5, Math.max(1, Number(newRules.startingLives) || 2)),
      maxLives: Math.min(10, Math.max(1, Number(newRules.maxLives) || 3)),
      maxPlayers: Math.min(16, Math.max(2, Number(newRules.maxPlayers) || 16)),
    };
    // Update seated starting lives
    for (const s of room.seatStates.values()) {
      s.lives = room.rules.startingLives;
      s.bonusRemaining = { ...room.rules.bonusAlphabet };
    }
    gameManager.broadcastRoomState(room);
  });

  socket.on('startNow', () => {
    const room = gameManager.rooms.get(currentRoomCode);
    if (!room || room.hostId !== socket.id) return;
    room.rulesOpen = false;
    gameManager.startGame(room);
  });

  socket.on('typing', (text) => {
    const room = gameManager.rooms.get(currentRoomCode);
    if (!room) return;
    gameManager.handleTyping(room, socket.id, text);
  });

  socket.on('submitWord', (word) => {
    const room = gameManager.rooms.get(currentRoomCode);
    if (!room) return;
    gameManager.handleSubmitWord(room, socket.id, word);
  });

  socket.on('sendChat', (text) => {
    const room = gameManager.rooms.get(currentRoomCode);
    if (!room) return;
    const p = room.players.get(socket.id);
    if (!p) return;
    const clean = (text || '').trim().slice(0, 200);
    if (!clean) return;
    const msg = {
      id: Date.now() + Math.random(),
      system: false,
      senderId: socket.id,
      senderName: p.nickname,
      isHost: room.hostId === socket.id,
      text: clean,
      time: new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
    };
    room.chat.push(msg);
    if (room.chat.length > 80) room.chat.shift();
    io.to(room.code).emit('chatMessage', msg);
  });

  socket.on('togglePrivacy', () => {
    const room = gameManager.rooms.get(currentRoomCode);
    if (!room || room.hostId !== socket.id) return;
    room.isPublic = !room.isPublic;
    gameManager.broadcastRoomState(room);
    io.emit('lobbyUpdated');
  });

  socket.on('disconnect', () => {
    if (currentRoomCode) {
      gameManager.leaveRoom(currentRoomCode, socket.id);
      io.emit('lobbyUpdated');
    }
  });
});

server.listen(PORT, () => {
  console.log(`Rimonada (רימונדה) server running at http://localhost:${PORT}`);
});
