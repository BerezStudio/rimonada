const {
  HEBREW_LETTERS,
  normalizeWord,
  normalizeSofit,
  findPromptMatch,
} = require('./dictionary');

const ISRAELI_BOTS = [
  { name: 'סבתא שולה', avatar: '🍲' },
  { name: 'הרס"ר שמעון', avatar: '🪖' },
  { name: 'נועה קילר', avatar: '💅' },
  { name: 'ג\'וני מתל אביב', avatar: '☕' },
  { name: 'דודו מהשוק', avatar: '🍉' },
  { name: 'אבי ביטר', avatar: '🎤' },
  { name: 'יובל המבולבל', avatar: '🤪' },
  { name: 'מלכת הפלאפל', avatar: '🧆' },
];

const AVATARS = ['😎', '🦊', '🦁', '🐸', '🐼', '🐙', '🦄', '🐝', '🍉', '🔥', '⚡', '🎯', '🚀', '👑', '🥑', '🌶️'];

function defaultBonusAlphabet() {
  const obj = {};
  for (const l of HEBREW_LETTERS) {
    obj[l] = 1;
  }
  return obj;
}

function generateRoomCode(existingCodes) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (let i = 0; i < 100; i++) {
    let code = '';
    for (let j = 0; j < 4; j++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!existingCodes.has(code)) return code;
  }
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

class GameManager {
  constructor(io, dictionary) {
    this.io = io;
    this.dictionary = dictionary;
    this.rooms = new Map();
  }

  getPublicRooms() {
    const list = [];
    for (const room of this.rooms.values()) {
      if (!room.isPublic) continue;
      list.push({
        code: room.code,
        name: room.name,
        playerCount: room.players.size,
        seatedCount: room.seatedOrder.length,
        phase: room.phase,
        difficulty: room.rules.difficulty,
        wordCount: room.usedWords.size,
      });
    }
    return list;
  }

  getStats() {
    let totalPlayers = 0;
    let publicRooms = 0;
    let privateRooms = 0;
    for (const room of this.rooms.values()) {
      totalPlayers += room.players.size;
      if (room.isPublic) publicRooms++;
      else privateRooms++;
    }
    return { totalPlayers, publicRooms, privateRooms };
  }

  createRoom({ name, isPublic, hostSocketId, hostNickname }) {
    const code = generateRoomCode(this.rooms);
    const room = {
      code,
      name: (name || `החדר של ${hostNickname || 'אורח'}`).slice(0, 32),
      isPublic: Boolean(isPublic),
      hostId: hostSocketId,
      createdAt: Date.now(),
      players: new Map(), // id -> { id, nickname, avatar, isBot, autoJoin }
      seatedOrder: [], // array of playerIds in current/next round
      seatStates: new Map(), // playerId -> { lives, bonusRemaining, lastWord, alive, typing }
      phase: 'lobby', // 'lobby' | 'playing' | 'ended'
      rules: {
        difficulty: 'medium',
        customMode: 'atLeast',
        customThreshold: 50,
        minTurnDuration: 5,
        maxPromptAge: 2,
        startingLives: 2,
        maxLives: 3,
        maxPlayers: 16,
        bonusAlphabet: defaultBonusAlphabet(),
      },
      prompt: '',
      promptAge: 0,
      currentTurnIndex: 0,
      turnStartedAt: 0,
      roundStartedAt: 0,
      usedWords: new Set(),
      winnerId: null,
      chat: [],
      timers: {
        bomb: null,
        countdown: null,
        botTyping: null,
        botInterval: null,
        roundEnd: null,
      },
      countdownEndsAt: null,
      rulesOpen: false,
    };
    this.rooms.set(code, room);
    return room;
  }

  joinRoom(code, socketId, nickname) {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return null;

    if (!room.players.has(socketId)) {
      const avatar = AVATARS[room.players.size % AVATARS.length];
      room.players.set(socketId, {
        id: socketId,
        nickname: (nickname || 'אורח').slice(0, 20),
        avatar,
        isBot: false,
        autoJoin: false,
      });
      if (!room.hostId || !room.players.has(room.hostId)) {
        room.hostId = socketId;
      }
      this.addSystemChat(room, `${nickname} נכנס/ה לחדר 👋`);
    }
    return room;
  }

  leaveRoom(code, socketId) {
    const room = this.rooms.get(code);
    if (!room) return;
    const player = room.players.get(socketId);
    if (!player) return;

    room.players.delete(socketId);
    this.unseatPlayer(room, socketId);
    this.addSystemChat(room, `${player.nickname} יצא/ה מהחדר`);

    // Check if any human players remain
    const humans = Array.from(room.players.values()).filter((p) => !p.isBot);
    if (humans.length === 0) {
      this.clearAllTimers(room);
      this.rooms.delete(code);
      return;
    }

    if (room.hostId === socketId) {
      room.hostId = humans[0].id;
      this.addSystemChat(room, `${humans[0].nickname} הוא/היא המארח/ת החדש/ה 👑`);
    }

    this.broadcastRoomState(room);
  }

  unseatPlayer(room, playerId) {
    const idx = room.seatedOrder.indexOf(playerId);
    if (idx === -1) return;

    if (room.phase === 'playing') {
      const state = room.seatStates.get(playerId);
      if (state) {
        state.alive = false;
        state.lives = 0;
      }
      if (room.seatedOrder[room.currentTurnIndex] === playerId) {
        this.clearTurnTimers(room);
        this.checkRoundEndOrAdvance(room);
      } else {
        this.checkRoundEndOnly(room);
      }
    } else {
      room.seatedOrder.splice(idx, 1);
      room.seatStates.delete(playerId);
      this.evaluateLobbyCountdown(room);
    }
  }

  seatPlayer(room, playerId) {
    if (room.phase !== 'lobby') return;
    if (room.seatedOrder.includes(playerId)) return;
    if (room.seatedOrder.length >= room.rules.maxPlayers) return;

    room.seatedOrder.push(playerId);
    room.seatStates.set(playerId, {
      lives: room.rules.startingLives,
      bonusRemaining: { ...room.rules.bonusAlphabet },
      lastWord: '',
      alive: true,
      typing: '',
    });
    this.evaluateLobbyCountdown(room);
  }

  addBot(room, level = 'medium') {
    if (room.phase !== 'lobby') return;
    if (room.seatedOrder.length >= room.rules.maxPlayers) return;

    const validLevel = ['easy', 'medium', 'hard'].includes(level) ? level : 'medium';
    const levelLabel = { easy: 'קל', medium: 'בינוני', hard: 'קשה' }[validLevel];

    const usedNames = new Set(Array.from(room.players.values()).map((p) => p.nickname));
    const available = ISRAELI_BOTS.filter((b) => !usedNames.has(b.name));
    const template = available.length > 0
      ? available[Math.floor(Math.random() * available.length)]
      : { name: `בוט ${room.players.size + 1}`, avatar: '' };

    const botId = `bot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    room.players.set(botId, {
      id: botId,
      nickname: template.name,
      avatar: template.avatar,
      isBot: true,
      botLevel: validLevel,
      autoJoin: true,
    });
    this.seatPlayer(room, botId);
    this.addSystemChat(room, `${template.name} (בוט ${levelLabel}) הצטרף למשחק`);
    this.broadcastRoomState(room);
  }

  removeBots(room) {
    for (const [id, p] of room.players.entries()) {
      if (p.isBot) {
        room.players.delete(id);
        const idx = room.seatedOrder.indexOf(id);
        if (idx !== -1) room.seatedOrder.splice(idx, 1);
        room.seatStates.delete(id);
      }
    }
    this.evaluateLobbyCountdown(room);
    this.broadcastRoomState(room);
  }

  evaluateLobbyCountdown(room) {
    if (room.phase !== 'lobby') return;
    if (room.seatedOrder.length >= 2 && !room.rulesOpen) {
      if (!room.timers.countdown) {
        room.countdownEndsAt = Date.now() + 5000;
        room.timers.countdown = setTimeout(() => {
          room.timers.countdown = null;
          room.countdownEndsAt = null;
          this.startGame(room);
        }, 5000);
      }
    } else {
      if (room.timers.countdown) {
        clearTimeout(room.timers.countdown);
        room.timers.countdown = null;
        room.countdownEndsAt = null;
      }
    }
  }

  startGame(room) {
    if (room.phase !== 'lobby') return;
    if (room.seatedOrder.length < 2) return;

    if (room.timers.countdown) {
      clearTimeout(room.timers.countdown);
      room.timers.countdown = null;
      room.countdownEndsAt = null;
    }

    room.phase = 'playing';
    room.rulesOpen = false;
    room.usedWords.clear();
    room.roundStartedAt = Date.now();
    room.winnerId = null;
    room.streak = 0;

    for (const pid of room.seatedOrder) {
      room.seatStates.set(pid, {
        lives: room.rules.startingLives,
        bonusRemaining: { ...room.rules.bonusAlphabet },
        lastWord: '',
        alive: true,
        typing: '',
      });
    }

    room.currentTurnIndex = Math.floor(Math.random() * room.seatedOrder.length);
    room.prompt = this.dictionary.getRandomPrompt(room.rules, room.streak);
    room.promptAge = 0;

    this.addSystemChat(room, 'המשחק התחיל!');
    this.startTurn(room);
    this.broadcastRoomState(room);
  }

  startTurn(room) {
    this.clearTurnTimers(room);
    const activeId = room.seatedOrder[room.currentTurnIndex];
    const activePlayer = room.players.get(activeId);
    const state = room.seatStates.get(activeId);
    if (!activePlayer || !state || !state.alive) {
      this.checkRoundEndOrAdvance(room);
      return;
    }

    state.typing = '';
    room.turnStartedAt = Date.now();

    const baseMinMs = (Number(room.rules.minTurnDuration) || 5) * 1000;
    const streakTier = Math.floor((room.streak || 0) / 3);
    const effectiveMinMs = Math.max(2000, baseMinMs - streakTier * 450);
    const effectiveMaxJitter = Math.max(1000, 4200 - streakTier * 500);
    const jitterMs = Math.floor(Math.random() * effectiveMaxJitter);
    const fuseMs = effectiveMinMs + jitterMs;
    room.turnFuseMs = fuseMs;

    room.timers.bomb = setTimeout(() => {
      this.handleBombExplosion(room, activeId);
    }, fuseMs);

    if (activePlayer.isBot) {
      this.scheduleBotTurn(room, activeId, effectiveMinMs, fuseMs);
    }
  }

  scheduleBotTurn(room, botId, minMs, fuseMs) {
    const bot = room.players.get(botId);
    const level = bot?.botLevel || 'medium';
    const profile = {
      easy:   { failChance: 0.28, startMin: 1100, startSpan: 1000, charMin: 135, charMax: 200 },
      medium: { failChance: 0.12, startMin: 550,  startSpan: 650,  charMin: 80,  charMax: 125 },
      hard:   { failChance: 0.03, startMin: 220,  startSpan: 350,  charMin: 40,  charMax: 72 },
    }[level] || { failChance: 0.12, startMin: 550, startSpan: 650, charMin: 80, charMax: 125 };

    if (Math.random() < profile.failChance) {
      return;
    }
    const word = this.dictionary.findBotWord(room.prompt, room.usedWords);
    if (!word) return;

    const startDelay = Math.min(fuseMs - 600, profile.startMin + Math.floor(Math.random() * profile.startSpan));
    const maxFinish = Math.max(startDelay + 300, fuseMs - 280);
    const rawInterval = profile.charMin + Math.floor(Math.random() * (profile.charMax - profile.charMin));
    const fitInterval = Math.floor((maxFinish - startDelay) / Math.max(1, word.length + 1));
    const charInterval = level === 'easy'
      ? rawInterval
      : Math.max(35, Math.min(rawInterval, fitInterval));

    let charIdx = 0;
    room.timers.botTyping = setTimeout(() => {
      if (room.phase !== 'playing' || room.seatedOrder[room.currentTurnIndex] !== botId) return;
      room.timers.botInterval = setInterval(() => {
        if (room.phase !== 'playing' || room.seatedOrder[room.currentTurnIndex] !== botId) {
          clearInterval(room.timers.botInterval);
          return;
        }
        charIdx++;
        const partial = word.slice(0, charIdx);
        const state = room.seatStates.get(botId);
        if (state) state.typing = partial;
        this.io.to(room.code).emit('playerTyping', { playerId: botId, text: partial });

        if (charIdx >= word.length) {
          clearInterval(room.timers.botInterval);
          room.timers.botInterval = null;
          setTimeout(() => {
            if (room.phase === 'playing' && room.seatedOrder[room.currentTurnIndex] === botId) {
              this.handleSubmitWord(room, botId, word);
            }
          }, level === 'hard' ? 80 : 140);
        }
      }, charInterval);
    }, Math.max(150, startDelay));
  }

  handleTyping(room, playerId, text) {
    if (room.phase !== 'playing') return;
    if (room.seatedOrder[room.currentTurnIndex] !== playerId) return;
    const state = room.seatStates.get(playerId);
    if (!state) return;
    const clean = (text || '').slice(0, 30);
    state.typing = clean;
    this.io.to(room.code).emit('playerTyping', { playerId, text: clean });
  }

  handleSubmitWord(room, playerId, rawWord) {
    if (room.phase !== 'playing') return;
    if (room.seatedOrder[room.currentTurnIndex] !== playerId) return;

    const word = normalizeWord(rawWord);
    if (!word) {
      this.io.to(playerId).emit('wordRejected', { reason: 'הקלד מילה!' });
      return;
    }

    if (!findPromptMatch(word, room.prompt)) {
      this.io.to(playerId).emit('wordRejected', { reason: `המילה חייבת להכיל "${room.prompt}"` });
      return;
    }

    if (room.usedWords.has(word)) {
      this.io.to(playerId).emit('wordRejected', { reason: 'המילה כבר שומשה ונעולה לסיבוב זה!' });
      return;
    }

    if (!this.dictionary.hasWord(word)) {
      this.io.to(playerId).emit('wordRejected', { reason: 'המילה לא נמצאה במילון' });
      return;
    }

    const badPrefix = this.dictionary.getCheatingPrefix(word, room.prompt);
    if (badPrefix) {
      this.io.to(playerId).emit('wordRejected', { reason: `אסור להשתמש באות קישור ("${badPrefix}") להשלמת הצירוף` });
      return;
    }

    // Valid word!
    this.clearTurnTimers(room);
    room.usedWords.add(word);
    room.streak = (room.streak || 0) + 1;

    const state = room.seatStates.get(playerId);
    state.lastWord = word;
    state.typing = '';

    // Credit bonus alphabet letters
    let earnedLife = false;
    const normWord = normalizeSofit(word);
    for (let i = 0; i < normWord.length; i++) {
      const ch = normWord[i];
      if (state.bonusRemaining[ch] && state.bonusRemaining[ch] > 0) {
        state.bonusRemaining[ch]--;
      }
    }

    const remainingSum = Object.values(state.bonusRemaining).reduce((a, b) => a + b, 0);
    if (remainingSum === 0) {
      if (state.lives < room.rules.maxLives) {
        state.lives++;
        earnedLife = true;
      }
      state.bonusRemaining = { ...room.rules.bonusAlphabet };
    }

    this.io.to(room.code).emit('wordAccepted', {
      playerId,
      word,
      earnedLife,
    });

    // Advance turn & pick new prompt (escalating difficulty on high streak)
    room.prompt = this.dictionary.getRandomPrompt(room.rules, room.streak);
    room.promptAge = 0;
    this.advanceTurn(room);
    this.startTurn(room);
    this.broadcastRoomState(room);
  }

  handleBombExplosion(room, playerId) {
    if (room.phase !== 'playing') return;
    this.clearTurnTimers(room);
    room.streak = 0;

    const state = room.seatStates.get(playerId);
    const player = room.players.get(playerId);
    if (state) {
      state.lives = Math.max(0, state.lives - 1);
      state.typing = '';
      if (state.lives === 0) {
        state.alive = false;
        if (player) {
          this.addSystemChat(room, `${player.nickname} הודח/ה מהמשחק`);
        }
      }
    }

    this.io.to(room.code).emit('bombExploded', {
      playerId,
      eliminated: state ? !state.alive : true,
    });

    room.promptAge++;
    if (room.promptAge >= (Number(room.rules.maxPromptAge) || 2)) {
      room.prompt = this.dictionary.getRandomPrompt(room.rules, room.streak);
      room.promptAge = 0;
    }

    this.checkRoundEndOrAdvance(room);
  }

  checkRoundEndOnly(room) {
    const aliveIds = room.seatedOrder.filter((id) => room.seatStates.get(id)?.alive);
    if (aliveIds.length <= 1) {
      this.endRound(room, aliveIds[0] || null);
      return true;
    }
    return false;
  }

  checkRoundEndOrAdvance(room) {
    if (this.checkRoundEndOnly(room)) return;
    this.advanceTurn(room);
    this.startTurn(room);
    this.broadcastRoomState(room);
  }

  advanceTurn(room) {
    const len = room.seatedOrder.length;
    for (let i = 1; i <= len; i++) {
      const nextIdx = (room.currentTurnIndex + i) % len;
      const pid = room.seatedOrder[nextIdx];
      if (room.seatStates.get(pid)?.alive) {
        room.currentTurnIndex = nextIdx;
        return;
      }
    }
  }

  endRound(room, winnerId) {
    this.clearTurnTimers(room);
    room.phase = 'ended';
    room.winnerId = winnerId;

    const winner = winnerId ? room.players.get(winnerId) : null;
    if (winner) {
      this.addSystemChat(room, `🥇 ${winner.nickname} ניצח/ה בסיבוב!`);
    }
    this.broadcastRoomState(room);

    room.timers.roundEnd = setTimeout(() => {
      room.timers.roundEnd = null;
      this.resetToLobby(room);
    }, 5000);
  }

  resetToLobby(room) {
    room.phase = 'lobby';
    room.prompt = '';
    room.promptAge = 0;
    room.winnerId = null;

    // Keep bots + autoJoin players seated
    const nextSeated = [];
    const nextStates = new Map();
    for (const [id, p] of room.players.entries()) {
      if (p.isBot || p.autoJoin) {
        if (nextSeated.length < room.rules.maxPlayers) {
          nextSeated.push(id);
          nextStates.set(id, {
            lives: room.rules.startingLives,
            bonusRemaining: { ...room.rules.bonusAlphabet },
            lastWord: '',
            alive: true,
            typing: '',
          });
        }
      }
    }
    room.seatedOrder = nextSeated;
    room.seatStates = nextStates;

    this.evaluateLobbyCountdown(room);
    this.broadcastRoomState(room);
  }

  addSystemChat(room, text) {
    const msg = {
      id: Date.now() + Math.random(),
      system: true,
      text,
      time: new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
    };
    room.chat.push(msg);
    if (room.chat.length > 80) room.chat.shift();
    this.io.to(room.code).emit('chatMessage', msg);
  }

  clearTurnTimers(room) {
    if (room.timers.bomb) {
      clearTimeout(room.timers.bomb);
      room.timers.bomb = null;
    }
    if (room.timers.botTyping) {
      clearTimeout(room.timers.botTyping);
      room.timers.botTyping = null;
    }
    if (room.timers.botInterval) {
      clearInterval(room.timers.botInterval);
      room.timers.botInterval = null;
    }
  }

  clearAllTimers(room) {
    this.clearTurnTimers(room);
    if (room.timers.countdown) {
      clearTimeout(room.timers.countdown);
      room.timers.countdown = null;
    }
    if (room.timers.roundEnd) {
      clearTimeout(room.timers.roundEnd);
      room.timers.roundEnd = null;
    }
  }

  serializeRoom(room) {
    const players = [];
    for (const p of room.players.values()) {
      players.push(p);
    }

    const seats = room.seatedOrder.map((pid) => {
      const p = room.players.get(pid);
      const s = room.seatStates.get(pid);
      return {
        id: pid,
        nickname: p?.nickname || 'שחקן',
        avatar: p?.avatar || '😎',
        isBot: Boolean(p?.isBot),
        lives: s?.lives ?? 0,
        alive: s?.alive ?? false,
        lastWord: s?.lastWord ?? '',
        typing: s?.typing ?? '',
        bonusRemaining: s?.bonusRemaining ?? {},
      };
    });

    return {
      code: room.code,
      name: room.name,
      isPublic: room.isPublic,
      hostId: room.hostId,
      phase: room.phase,
      rules: room.rules,
      rulesOpen: room.rulesOpen,
      prompt: room.prompt,
      currentPlayerId: room.phase === 'playing' ? room.seatedOrder[room.currentTurnIndex] : null,
      turnStartedAt: room.turnStartedAt,
      turnFuseMs: room.phase === 'playing' ? (room.turnFuseMs || 5000) : 0,
      streak: room.streak || 0,
      roundStartedAt: room.roundStartedAt,
      usedWordCount: room.usedWords.size,
      winnerId: room.winnerId,
      countdownEndsAt: room.countdownEndsAt,
      players,
      seats,
      chat: room.chat,
    };
  }

  broadcastRoomState(room) {
    this.io.to(room.code).emit('roomState', this.serializeRoom(room));
  }
}

module.exports = { GameManager };
