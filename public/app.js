const socket = io();

const HEBREW_LETTERS = [
  'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'כ',
  'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ', 'ק', 'ר', 'ש', 'ת',
];
const SOFIT_MAP = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const AVATAR_COLORS = ['#7c5cff', '#e63956', '#f59e0b', '#10b981', '#06b6d4', '#ec4899', '#8b5cf6', '#f97316'];

const SVG_HEART = '<svg class="heart-svg" width="14" height="14" viewBox="0 0 24 24" fill="#ff3b5c"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
const SVG_SKULL = '<svg class="skull-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ea6c2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><path d="M8 20v2h8v-2"/><path d="m12.5 17-.5-1-.5 1h1z"/><path d="M16 20a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20"/></svg>';
const SVG_VOL_ON = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
const SVG_VOL_OFF = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
const SVG_CROWN = '<svg class="crown-svg" width="13" height="13" viewBox="0 0 24 24" fill="#f5b942"><path d="M2 18h20v2H2v-2zm0-2l2-9 5 4 3-7 3 7 5-4 2 9H2z"/></svg>';

function normalizeSofit(str) {
  return [...str].map((c) => SOFIT_MAP[c] || c).join('');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function highlightPromptInWord(word, prompt) {
  if (!word) return '';
  if (!prompt) return escapeHtml(word);
  const normW = normalizeSofit(word);
  const normP = normalizeSofit(prompt);
  const idx = normW.indexOf(normP);
  if (idx === -1) return escapeHtml(word);
  const before = escapeHtml(word.slice(0, idx));
  const match = escapeHtml(word.slice(idx, idx + normP.length));
  const after = escapeHtml(word.slice(idx + normP.length));
  return `${before}<span class="match-hl">${match}</span>${after}`;
}

function formatSystemChatText(text) {
  return text
    .replace(/נכנס\/ה לחדר/g, 'הצטרף לחדר')
    .replace(/יצא\/ה מהחדר/g, 'עזב את החדר')
    .replace(/הוא\/היא המארח\/ת החדש\/ה/g, 'קיבל את ניהול החדר');
}

// State
let myId = null;
let currentRoom = null;
let isPublicCreate = true;
let roundTimerInterval = null;
let countdownInterval = null;
let selectedAvatar = localStorage.getItem('rimon_avatar_color');
if (!AVATAR_COLORS.includes(selectedAvatar)) {
  selectedAvatar = AVATAR_COLORS[0];
}

// Elements
const landingView = document.getElementById('landing-view');
const roomView = document.getElementById('room-view');
const nicknameInput = document.getElementById('nickname-input');
const roomNameInput = document.getElementById('room-name-input');
const joinCodeInput = document.getElementById('join-code-input');
const joinErrorEl = document.getElementById('join-error');
const publicRoomsList = document.getElementById('public-rooms-list');
const lobbyStatsText = document.getElementById('lobby-stats-text');
const dictCountBadge = document.getElementById('dict-count-badge');
const avatarPickerBtn = document.getElementById('avatar-picker-btn');
const selectedAvatarDisplay = document.getElementById('selected-avatar-display');
const avatarPopover = document.getElementById('avatar-popover');
const sidebar = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');

const MEME_AVATARS = window.MEME_AVATARS || [];
let selectedAvatarId = localStorage.getItem('rimon_meme_avatar');
if (!MEME_AVATARS.some((a) => a.id === selectedAvatarId)) {
  selectedAvatarId = MEME_AVATARS[0]?.id || 'shocked-cat';
}

function getMemeAvatarForPlayer(player) {
  if (!MEME_AVATARS.length) return { bg: '#6c5ce7', svg: '<span>ש</span>' };
  if (player && player.id === myId) {
    return MEME_AVATARS.find((a) => a.id === selectedAvatarId) || MEME_AVATARS[0];
  }
  let hash = 0;
  const s = (player?.id || player?.nickname || '');
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return MEME_AVATARS[hash % MEME_AVATARS.length];
}

function renderAvatarPicker() {
  const current = MEME_AVATARS.find((a) => a.id === selectedAvatarId) || MEME_AVATARS[0];
  if (current) {
    selectedAvatarDisplay.style.background = current.bg;
    selectedAvatarDisplay.innerHTML = current.svg;
  }
  avatarPopover.innerHTML = '';
  for (const av of MEME_AVATARS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = av.label;
    btn.className = 'avatar-option' + (av.id === selectedAvatarId ? ' selected' : '');
    btn.innerHTML = `<span class="avatar-dot" style="background:${av.bg}">${av.svg}</span>`;
    btn.onclick = (e) => {
      e.stopPropagation();
      selectedAvatarId = av.id;
      localStorage.setItem('rimon_meme_avatar', av.id);
      renderAvatarPicker();
      avatarPopover.classList.add('hidden');
    };
    avatarPopover.appendChild(btn);
  }
}

avatarPickerBtn.onclick = (e) => {
  e.stopPropagation();
  avatarPopover.classList.toggle('hidden');
};

document.addEventListener('click', (e) => {
  if (!avatarPopover.classList.contains('hidden') && !avatarPopover.contains(e.target)) {
    avatarPopover.classList.add('hidden');
  }
});

renderAvatarPicker();

// Load saved nickname
const savedNick = localStorage.getItem('rimon_nickname') || `שחקן${Math.floor(100 + Math.random() * 900)}`;
nicknameInput.value = savedNick;
roomNameInput.placeholder = `החפלה של ${savedNick}`;

nicknameInput.addEventListener('input', () => {
  const val = nicknameInput.value.trim() || 'אורח';
  localStorage.setItem('rimon_nickname', val);
  roomNameInput.placeholder = `החפלה של ${val}`;
});

// Visibility toggle
const visPublicBtn = document.getElementById('vis-public');
const visPrivateBtn = document.getElementById('vis-private');
visPublicBtn.onclick = () => {
  isPublicCreate = true;
  visPublicBtn.classList.add('active');
  visPrivateBtn.classList.remove('active');
};
visPrivateBtn.onclick = () => {
  isPublicCreate = false;
  visPrivateBtn.classList.add('active');
  visPublicBtn.classList.remove('active');
};

// Fetch lobby
async function fetchLobby() {
  try {
    const res = await fetch('/api/lobby');
    const data = await res.json();
    if (dictCountBadge) dictCountBadge.textContent = `${data.dictionarySize.toLocaleString('he-IL')} מילים בעברית`;
    lobbyStatsText.textContent = `${data.stats.totalPlayers} שחקנים ב-${data.stats.publicRooms} חדרים ציבוריים ו-${data.stats.privateRooms} פרטיים`;

    publicRoomsList.innerHTML = '';
    if (data.rooms.length === 0) {
      publicRoomsList.innerHTML = '<div class="empty-rooms">אין חדרים ציבוריים פתוחים כרגע. פתח חדר חדש למעלה והזמן חברים!</div>';
      return;
    }

    for (const r of data.rooms) {
      const card = document.createElement('div');
      card.className = 'room-ticket';
      const diffLabel = { beginner: 'מתחיל', medium: 'בינוני', hard: 'קשה', custom: 'מותאם' }[r.difficulty] || 'בינוני';
      const isPlaying = r.phase === 'playing';
      const statusLabel = isPlaying ? `🔥 בסיבוב • ${r.wordCount} מילים` : '⏳ ממתין בלובי';
      card.innerHTML = `
        <div class="room-ticket-top">
          <div class="room-ticket-name">${escapeHtml(r.name)}</div>
          <div class="room-badge">👥 ${r.playerCount}</div>
        </div>
        <div class="room-ticket-meta">
          <span class="room-status-chip ${isPlaying ? 'live' : ''}">${statusLabel} • ${diffLabel}</span>
          <span class="room-code-tag">${r.code}</span>
        </div>
      `;
      card.onclick = () => joinRoomByCode(r.code);
      publicRoomsList.appendChild(card);
    }
  } catch (e) {
    console.error(e);
  }
}

document.getElementById('refresh-rooms-btn').onclick = fetchLobby;

document.getElementById('create-room-btn').onclick = () => {
  const nickname = nicknameInput.value.trim() || 'אורח';
  const name = roomNameInput.value.trim() || `החפלה של ${nickname}`;
  socket.emit('createRoom', { name, isPublic: isPublicCreate, nickname, avatar: selectedAvatar }, (res) => {
    if (res?.ok) {
      history.pushState({}, '', '/' + res.code);
      showRoomView();
    }
  });
};

function joinRoomByCode(code) {
  joinErrorEl.textContent = '';
  const nickname = nicknameInput.value.trim() || 'אורח';
  socket.emit('joinRoom', { code, nickname, avatar: selectedAvatar }, (res) => {
    if (res?.ok) {
      history.pushState({}, '', '/' + res.code);
      showRoomView();
    } else {
      joinErrorEl.textContent = res?.error || 'שגיאה בכניסה לחדר';
    }
  });
}

document.getElementById('join-code-btn').onclick = () => {
  const code = joinCodeInput.value.trim().toUpperCase();
  if (code.length !== 4) {
    joinErrorEl.textContent = 'יש להזין קוד בן 4 תווים';
    return;
  }
  joinRoomByCode(code);
};

joinCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('join-code-btn').click();
});

function syncResponsiveSidebarDefault() {
  if (window.innerWidth < 900) {
    sidebar.classList.add('collapsed');
    sidebarBackdrop.classList.add('hidden');
  } else {
    sidebar.classList.remove('collapsed');
    sidebarBackdrop.classList.add('hidden');
  }
}

function showLandingView() {
  landingView.classList.remove('hidden');
  roomView.classList.add('hidden');
  currentRoom = null;
  history.pushState({}, '', '/');
  fetchLobby();
}

function showRoomView() {
  landingView.classList.add('hidden');
  roomView.classList.remove('hidden');
  syncResponsiveSidebarDefault();
  setTimeout(resizeCanvas, 60);
}

document.getElementById('back-home-btn').onclick = () => {
  socket.emit('leaveRoom');
  showLandingView();
};

// Check URL on load for /CODE
const pathMatch = window.location.pathname.match(/^\/([A-Za-z0-9]{4})$/);
if (pathMatch) {
  joinRoomByCode(pathMatch[1]);
} else {
  fetchLobby();
}

// ==================== SOCKET EVENTS ====================
socket.on('connect', () => {
  myId = socket.id;
});

socket.on('lobbyUpdated', () => {
  if (!landingView.classList.contains('hidden')) {
    fetchLobby();
  }
});

socket.on('roomState', (room) => {
  currentRoom = room;
  renderRoom(room);
});

socket.on('playerTyping', ({ playerId, text }) => {
  if (!currentRoom) return;
  const seat = currentRoom.seats.find((s) => s.id === playerId);
  if (seat) {
    seat.typing = text;
    const el = document.querySelector(`.seat-node[data-id="${playerId}"] .seat-word`);
    if (el) {
      el.classList.remove('dimmed');
      el.innerHTML = highlightPromptInWord(text, currentRoom.prompt);
    }
  }
});

socket.on('wordAccepted', ({ playerId, word, earnedLife }) => {
  window.soundFX.playAccept(earnedLife);
  const node = document.querySelector(`.seat-node[data-id="${playerId}"]`);
  if (node) {
    node.classList.add('word-flash');
    setTimeout(() => node.classList.remove('word-flash'), 450);
  }
  spawnSeeds(14, '#2fe070');
});

socket.on('wordRejected', ({ reason }) => {
  window.soundFX.playReject();
  const input = document.getElementById('word-input');
  const toast = document.getElementById('reject-toast');
  input.classList.remove('shake');
  void input.offsetWidth;
  input.classList.add('shake');
  toast.textContent = reason;
  toast.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.add('hidden'), 1800);
});

socket.on('bombExploded', () => {
  window.soundFX.playExplosion();
  const arena = document.getElementById('arena-container');
  arena.classList.remove('arena-shake');
  void arena.offsetWidth;
  arena.classList.add('arena-shake');
  spawnSeeds(42, '#ff3b5c');
});

socket.on('chatMessage', (msg) => {
  appendChatMessage(msg);
});

// ==================== RENDERING ====================
function getDisplayAvatar(player) {
  if (!player) return '😎';
  if (player.id === myId && selectedAvatar) return selectedAvatar;
  return player.avatar;
}

function renderRoom(room) {
  const isHost = room.hostId === myId;
  const myPlayer = room.players.find((p) => p.id === myId);
  const mySeat = room.seats.find((s) => s.id === myId);
  const isMyTurn = room.phase === 'playing' && room.currentPlayerId === myId;

  // Top bar
  document.getElementById('room-code-text').textContent = room.isPublic ? room.code : 'פרטי';
  document.getElementById('room-player-count').textContent = room.players.length;
  document.getElementById('room-title-bar').innerHTML = `${escapeHtml(room.name)} ${isHost ? SVG_CROWN : ''}`;

  const roundStatsPill = document.getElementById('round-stats-pill');
  const streakBadge = document.getElementById('round-streak-badge');
  if (room.phase === 'playing') {
    roundStatsPill.classList.remove('hidden');
    document.getElementById('round-words-count').textContent = `${room.usedWordCount} מילים`;
    if (streakBadge) {
      if ((room.streak || 0) >= 3) {
        streakBadge.textContent = `רצף ${room.streak}`;
        streakBadge.classList.remove('hidden');
      } else {
        streakBadge.classList.add('hidden');
      }
    }
    if (!roundTimerInterval) {
      roundTimerInterval = setInterval(updateRoundTimer, 1000);
    }
    updateRoundTimer();
  } else {
    roundStatsPill.classList.add('hidden');
    if (streakBadge) streakBadge.classList.add('hidden');
    if (roundTimerInterval) {
      clearInterval(roundTimerInterval);
      roundTimerInterval = null;
    }
  }

  // Status banner (single source of turn truth)
  const statusBanner = document.getElementById('status-banner');
  if (room.phase === 'lobby') {
    if (room.rulesOpen) {
      statusBanner.textContent = 'סגור את חלון החוקים כדי להתחיל...';
    } else if (room.countdownEndsAt) {
      updateCountdownBanner();
      if (!countdownInterval) countdownInterval = setInterval(updateCountdownBanner, 250);
    } else {
      const needed = Math.max(0, 2 - room.seats.length);
      statusBanner.textContent = needed > 0
        ? `ממתין לעוד ${needed} שחקנים... (אפשר להוסיף בוט)`
        : 'מתכונן להתחיל...';
    }
  } else if (room.phase === 'playing') {
    const activeP = room.players.find((p) => p.id === room.currentPlayerId);
    statusBanner.textContent = isMyTurn
      ? `תורך! שלוף מילה שמכילה "${room.prompt}"`
      : `התור של ${activeP?.nickname || '...'}`;
  } else if (room.phase === 'ended') {
    statusBanner.textContent = 'הסיבוב הסתיים!';
  }

  if (room.phase !== 'lobby' && countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  // Rules summary
  const diffMap = { beginner: 'מתחיל (500+)', medium: 'בינוני (300+)', hard: 'קשה (100+)', custom: 'מותאם אישית' };
  document.getElementById('rules-summary-text').textContent = `עברית מלאה • ${diffMap[room.rules.difficulty] || 'בינוני'}`;
  const openRulesBtn = document.getElementById('open-rules-btn');
  openRulesBtn.textContent = isHost && room.phase === 'lobby' ? 'ערוך חוקים' : 'הצג חוקים';
  openRulesBtn.classList.toggle('hidden', isMyTurn);

  // Bomb center
  const bombCenter = document.getElementById('bomb-center');
  const promptBadge = document.getElementById('prompt-badge');
  const lobbyLogo = document.getElementById('lobby-logo-text');
  const arrowWrap = document.getElementById('turn-arrow-wrap');

  if (room.phase === 'playing') {
    bombCenter.classList.add('ticking');
    promptBadge.classList.remove('hidden');
    promptBadge.textContent = room.prompt;
    lobbyLogo.classList.add('hidden');
  } else {
    bombCenter.classList.remove('ticking', 'critical');
    promptBadge.classList.add('hidden');
    lobbyLogo.classList.remove('hidden');
    arrowWrap.classList.add('hidden');
  }

  // Winner overlay
  const winnerOverlay = document.getElementById('winner-overlay');
  if (room.phase === 'ended' && room.winnerId) {
    const w = room.players.find((p) => p.id === room.winnerId);
    const wav = getMemeAvatarForPlayer(w);
    const winEl = document.getElementById('winner-avatar-emoji');
    winEl.innerHTML = wav.svg;
    winEl.parentElement.style.background = wav.bg;
    document.getElementById('winner-title').textContent = `${w?.nickname || 'שחקן'} — ניצחון בסיבוב!`;
    winnerOverlay.classList.remove('hidden');
  } else {
    winnerOverlay.classList.add('hidden');
  }

  // Bonus alphabet (docked above footer)
  const bonusBar = document.getElementById('bonus-alphabet-bar');
  if (room.phase === 'playing' && mySeat && mySeat.alive) {
    bonusBar.classList.remove('hidden');
    bonusBar.innerHTML = '';
    for (const letter of HEBREW_LETTERS) {
      const rem = mySeat.bonusRemaining[letter] ?? 0;
      const tile = document.createElement('div');
      tile.className = 'bonus-tile' + (rem <= 0 ? ' done' : '');
      tile.textContent = letter;
      bonusBar.appendChild(tile);
    }
  } else {
    bonusBar.classList.add('hidden');
  }

  // Players ring (recalculate after bonusBar visibility changes playfield height)
  requestAnimationFrame(() => renderPlayersRing(room));

  // Bottom bar controls
  const joinBtn = document.getElementById('join-seat-btn');
  const leaveSeatBtn = document.getElementById('leave-seat-btn');
  const autoJoinBtn = document.getElementById('auto-join-btn');
  const botGroup = document.getElementById('bot-controls-group');
  const startNowBtn = document.getElementById('start-now-btn');

  const isSeated = Boolean(mySeat);
  joinBtn.classList.toggle('hidden', isSeated || room.phase !== 'lobby');
  leaveSeatBtn.classList.toggle('hidden', !isSeated);
  autoJoinBtn.classList.toggle('armed', Boolean(myPlayer?.autoJoin));
  autoJoinBtn.textContent = myPlayer?.autoJoin ? 'הצטרפות אוטומטית: פעיל ✓' : 'הצטרפות אוטומטית';
  botGroup.classList.toggle('hidden', !isHost || room.phase !== 'lobby');
  startNowBtn.classList.toggle('hidden', !isHost || room.phase !== 'lobby' || room.seats.length < 2);

  // Word input vs clean non-duplicate wait hint
  const wordWrap = document.getElementById('word-input-wrap');
  const wordInput = document.getElementById('word-input');
  const waitText = document.getElementById('turn-wait-text');

  if (isMyTurn) {
    wordWrap.classList.remove('hidden');
    waitText.classList.add('hidden');
    wordInput.placeholder = `הקלד מילה שמכילה "${room.prompt}"...`;
    if (document.activeElement !== wordInput) {
      wordInput.value = '';
      wordInput.focus();
    }
  } else {
    wordWrap.classList.add('hidden');
    waitText.classList.add('hidden');
  }

  // Sidebar players & room tab privacy state
  renderSidebarPlayers(room);
  const privacyStatus = document.getElementById('room-privacy-status');
  const togglePrivacyBtn = document.getElementById('toggle-privacy-btn');
  if (room.isPublic) {
    privacyStatus.textContent = 'חדר ציבורי — מופיע ברשימת הלובי';
    togglePrivacyBtn.textContent = 'חדר ציבורי — לחץ להפוך לפרטי';
  } else {
    privacyStatus.textContent = 'חדר פרטי — כניסה עם קוד בלבד';
    togglePrivacyBtn.textContent = 'חדר פרטי — לחץ להפוך לציבורי';
  }
  togglePrivacyBtn.classList.toggle('hidden', !isHost);
  document.getElementById('clear-bots-btn').classList.toggle('hidden', !isHost);
}

function renderPlayersRing(room) {
  const ring = document.getElementById('players-ring');
  const playfield = document.getElementById('playfield');
  const bombCenter = document.getElementById('bomb-center');
  const rect = playfield.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const isCompact = window.innerWidth <= 600 || rect.height < 360;

  const bombR = (bombCenter.offsetWidth || (isCompact ? 114 : 168)) / 2;
  const seatW = isCompact ? 96 : 126;
  const seatH = isCompact ? 82 : 98;

  const minRx = bombR + seatW * 0.5 + 10;
  const minRy = bombR + seatH * 0.5 + 10;
  const maxRx = Math.max(minRx, cx - seatW * 0.5 - 8);
  const maxRy = Math.max(minRy, cy - seatH * 0.5 - 8);

  const rx = Math.min(maxRx, Math.max(minRx, Math.min(cx * 0.74, 300)));
  const ry = Math.min(maxRy, Math.max(minRy, Math.min(cy * 0.74, 220)));

  ring.innerHTML = '';
  const n = room.seats.length;
  const arrowWrap = document.getElementById('turn-arrow-wrap');
  let foundActive = false;

  room.seats.forEach((seat, idx) => {
    const angle = (idx / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(angle) * rx;
    const y = cy + Math.sin(angle) * ry;

    const isTurn = room.phase === 'playing' && room.currentPlayerId === seat.id;
    if (isTurn) {
      foundActive = true;
      const actualAngle = Math.atan2(y - cy, x - cx);
      const deg = (actualAngle * 180) / Math.PI + 90;
      arrowWrap.style.transform = `rotate(${deg}deg)`;
      arrowWrap.classList.remove('hidden');
    }

    const node = document.createElement('div');
    node.className = 'seat-node' + (isTurn ? ' active-turn' : '') + (!seat.alive ? ' eliminated' : '');
    node.dataset.id = seat.id;
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;

    const heartsStr = seat.alive ? SVG_HEART.repeat(Math.max(0, seat.lives)) : SVG_SKULL;
    const wordHtml = seat.typing
      ? highlightPromptInWord(seat.typing, room.prompt)
      : (seat.lastWord ? highlightPromptInWord(seat.lastWord, room.prompt) : '');

    const av = getMemeAvatarForPlayer(seat);
    node.innerHTML = `
      <div class="seat-name">${escapeHtml(seat.nickname)}</div>
      <div class="seat-hearts">${heartsStr}</div>
      <div class="seat-avatar" style="background:${av.bg}">${av.svg}</div>
      <div class="seat-word ${seat.typing ? '' : 'dimmed'}">${wordHtml}</div>
    `;
    ring.appendChild(node);
  });

  if (!foundActive) {
    arrowWrap.classList.add('hidden');
  }
}

function updateRoundTimer() {
  if (!currentRoom || currentRoom.phase !== 'playing') return;
  const sec = Math.max(0, Math.floor((Date.now() - currentRoom.roundStartedAt) / 1000));
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  document.getElementById('round-timer').textContent = `${m}:${s}`;
}

function updateCountdownBanner() {
  if (!currentRoom || !currentRoom.countdownEndsAt) return;
  const left = Math.max(1, Math.ceil((currentRoom.countdownEndsAt - Date.now()) / 1000));
  document.getElementById('status-banner').textContent = `המשחק מתחיל בעוד ${left}...`;
}

// ==================== CONTROLS & INPUT ====================
document.getElementById('join-seat-btn').onclick = () => socket.emit('joinSeat');
document.getElementById('leave-seat-btn').onclick = () => socket.emit('leaveSeat');
document.getElementById('auto-join-btn').onclick = () => {
  const me = currentRoom?.players.find((p) => p.id === myId);
  socket.emit('toggleAutoJoin', !me?.autoJoin);
};
document.getElementById('add-bot-btn').onclick = () => {
  const level = document.getElementById('bot-level-select')?.value || 'medium';
  socket.emit('addBot', { level });
};
document.getElementById('start-now-btn').onclick = () => socket.emit('startNow');

const wordInput = document.getElementById('word-input');
wordInput.addEventListener('input', () => {
  socket.emit('typing', wordInput.value);
});
wordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    socket.emit('submitWord', wordInput.value);
    wordInput.value = '';
  }
});

// Copy room code / link
function copyInviteLink() {
  if (!currentRoom) return;
  const url = `${window.location.origin}/${currentRoom.code}`;
  navigator.clipboard?.writeText(url).catch(() => {});
  const pill = document.getElementById('room-code-text');
  const prev = pill.textContent;
  pill.textContent = 'הועתק!';
  setTimeout(() => { pill.textContent = prev; }, 1200);
}
document.getElementById('room-code-pill').onclick = copyInviteLink;
document.getElementById('copy-invite-btn').onclick = copyInviteLink;

document.getElementById('toggle-privacy-btn').onclick = () => socket.emit('togglePrivacy');
document.getElementById('clear-bots-btn').onclick = () => socket.emit('removeBots');

document.getElementById('mute-btn').innerHTML = SVG_VOL_ON;
document.getElementById('mute-btn').onclick = () => {
  window.soundFX.muted = !window.soundFX.muted;
  document.getElementById('mute-btn').innerHTML = window.soundFX.muted ? SVG_VOL_OFF : SVG_VOL_ON;
};

// Sidebar tabs & slide-over drawer toggle
function toggleSidebarDrawer() {
  const willOpen = sidebar.classList.contains('collapsed');
  sidebar.classList.toggle('collapsed');
  if (window.innerWidth < 900) {
    sidebarBackdrop.classList.toggle('hidden', !willOpen);
  } else {
    sidebarBackdrop.classList.add('hidden');
  }
  setTimeout(() => {
    resizeCanvas();
  }, 240);
}

document.getElementById('toggle-sidebar-btn').onclick = toggleSidebarDrawer;
sidebarBackdrop.onclick = () => {
  sidebar.classList.add('collapsed');
  sidebarBackdrop.classList.add('hidden');
};

document.querySelectorAll('.sidebar-tab').forEach((tab) => {
  tab.onclick = () => {
    document.querySelectorAll('.sidebar-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    document.getElementById('tab-chat').classList.toggle('hidden', target !== 'chat');
    document.getElementById('tab-players').classList.toggle('hidden', target !== 'players');
    document.getElementById('tab-room').classList.toggle('hidden', target !== 'room');
  };
});

document.getElementById('chat-form').onsubmit = (e) => {
  e.preventDefault();
  const inp = document.getElementById('chat-input');
  if (inp.value.trim()) {
    socket.emit('sendChat', inp.value.trim());
    inp.value = '';
  }
};

function appendChatMessage(msg) {
  const box = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg' + (msg.system ? ' system' : '');
  if (msg.system) {
    div.innerHTML = `<span class="chat-time">${msg.time}</span> ${escapeHtml(formatSystemChatText(msg.text))}`;
  } else {
    div.innerHTML = `<span class="chat-time">${msg.time}</span> <span class="chat-sender">${msg.isHost ? SVG_CROWN + ' ' : ''}${escapeHtml(msg.senderName)}:</span> ${escapeHtml(msg.text)}`;
  }
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function renderSidebarPlayers(room) {
  const list = document.getElementById('sidebar-players-list');
  list.innerHTML = '';
  for (const p of room.players) {
    const item = document.createElement('div');
    item.className = 'player-list-item';
    const botLevelLabel = p.isBot ? `בוט (${{ easy: 'קל', medium: 'בינוני', hard: 'קשה' }[p.botLevel] || 'בינוני'})` : 'שחקן';
    const pav = getMemeAvatarForPlayer(p);
    item.innerHTML = `
      <span style="display:inline-flex;align-items:center;gap:8px;"><span class="avatar-dot sm" style="background:${pav.bg}">${pav.svg}</span> ${escapeHtml(p.nickname)} ${p.id === room.hostId ? SVG_CROWN : ''}</span>
      <span style="font-size:0.78rem; color:var(--text-muted);">${botLevelLabel}</span>
    `;
    list.appendChild(item);
  }
}

// ==================== RULES MODAL ====================
const rulesModal = document.getElementById('rules-modal');
const rulesFieldset = document.getElementById('rules-fieldset');
const rulesReadonlyCard = document.getElementById('rules-readonly-card');

function buildReadonlyRulesHtml(r) {
  const diffLabels = {
    beginner: 'מתחיל (מינימום 500 מילים)',
    medium: 'בינוני (מינימום 300 מילים)',
    hard: 'קשה (מינימום 100 מילים)',
    custom: r.customMode === 'atMost'
      ? `מותאם (לכל היותר ${r.customThreshold || 50} מילים)`
      : `מותאם (לפחות ${r.customThreshold || 50} מילים)`,
  };
  const activeLetters = HEBREW_LETTERS.filter((l) => (r.bonusAlphabet?.[l] ?? 1) > 0);
  const bonusSummary = activeLetters.length === HEBREW_LETTERS.length
    ? 'כל 22 אותיות האלף-בית פעילות לבונוס'
    : activeLetters.length === 0
      ? 'ללא אותיות בונוס בסיבוב זה'
      : `אותיות בונוס פעילות: ${activeLetters.join(' ')}`;

  return `
    <div class="readonly-grid">
      <div class="readonly-item">
        <span class="readonly-label">רמת קושי צירופים</span>
        <span class="readonly-value">${diffLabels[r.difficulty] || diffLabels.medium}</span>
      </div>
      <div class="readonly-item">
        <span class="readonly-label">זמן תור מינימלי</span>
        <span class="readonly-value">${r.minTurnDuration} שניות</span>
      </div>
      <div class="readonly-item">
        <span class="readonly-label">החלפת צירוף</span>
        <span class="readonly-value">אחרי ${r.maxPromptAge} כישלונות</span>
      </div>
      <div class="readonly-item">
        <span class="readonly-label">שחקנים מקסימלי</span>
        <span class="readonly-value">${r.maxPlayers} שחקנים</span>
      </div>
      <div class="readonly-item">
        <span class="readonly-label">לבבות התחלתיים</span>
        <span class="readonly-value" style="display:inline-flex;align-items:center;gap:4px;">${SVG_HEART.repeat(r.startingLives)} (${r.startingLives})</span>
      </div>
      <div class="readonly-item">
        <span class="readonly-label">מקסימום לבבות</span>
        <span class="readonly-value">${r.maxLives} לבבות</span>
      </div>
    </div>
    <div class="readonly-bonus-summary">${bonusSummary}</div>
  `;
}

document.getElementById('open-rules-btn').onclick = () => {
  if (!currentRoom) return;
  const canEdit = currentRoom.hostId === myId && currentRoom.phase === 'lobby';
  if (canEdit) socket.emit('setRulesOpen', true);

  const r = currentRoom.rules;
  rulesFieldset.classList.toggle('hidden', !canEdit);
  rulesReadonlyCard.classList.toggle('hidden', canEdit);
  document.getElementById('save-rules-btn').textContent = canEdit ? 'שמור וסגור' : 'סגור';

  if (canEdit) {
    document.getElementById('rule-difficulty').value = r.difficulty;
    document.getElementById('rule-min-turn').value = r.minTurnDuration;
    document.getElementById('rule-prompt-age').value = r.maxPromptAge;
    document.getElementById('rule-max-players').value = r.maxPlayers;
    document.getElementById('rule-start-lives').value = r.startingLives;
    document.getElementById('rule-max-lives').value = r.maxLives;
    document.getElementById('rule-custom-mode').value = r.customMode || 'atLeast';
    document.getElementById('rule-custom-threshold').value = r.customThreshold || 50;
    document.getElementById('custom-diff-row').classList.toggle('hidden', r.difficulty !== 'custom');

    const grid = document.getElementById('bonus-editor-grid');
    grid.innerHTML = '';
    for (const l of HEBREW_LETTERS) {
      const cell = document.createElement('div');
      cell.className = 'bonus-edit-cell';
      cell.innerHTML = `<span>${l}</span><input type="number" min="0" max="5" data-letter="${l}" value="${r.bonusAlphabet[l] ?? 1}" />`;
      grid.appendChild(cell);
    }
  } else {
    rulesReadonlyCard.innerHTML = buildReadonlyRulesHtml(r);
  }

  rulesModal.classList.remove('hidden');
};

document.getElementById('rule-difficulty').onchange = (e) => {
  document.getElementById('custom-diff-row').classList.toggle('hidden', e.target.value !== 'custom');
};

document.getElementById('set-all-bonus-btn').onclick = () => {
  const val = document.getElementById('set-all-bonus-val').value;
  document.querySelectorAll('#bonus-editor-grid input').forEach((inp) => {
    inp.value = val;
  });
};

function closeRulesModal() {
  rulesModal.classList.add('hidden');
  if (currentRoom && currentRoom.hostId === myId && currentRoom.phase === 'lobby') {
    socket.emit('setRulesOpen', false);
  }
}

rulesModal.addEventListener('click', (e) => {
  if (e.target === rulesModal) closeRulesModal();
});

document.getElementById('save-rules-btn').onclick = () => {
  if (currentRoom && currentRoom.hostId === myId && currentRoom.phase === 'lobby') {
    const bonusAlphabet = {};
    document.querySelectorAll('#bonus-editor-grid input').forEach((inp) => {
      bonusAlphabet[inp.dataset.letter] = Math.min(5, Math.max(0, Number(inp.value) || 0));
    });
    socket.emit('updateRules', {
      difficulty: document.getElementById('rule-difficulty').value,
      customMode: document.getElementById('rule-custom-mode').value,
      customThreshold: Number(document.getElementById('rule-custom-threshold').value) || 50,
      minTurnDuration: Number(document.getElementById('rule-min-turn').value) || 5,
      maxPromptAge: Number(document.getElementById('rule-prompt-age').value) || 2,
      maxPlayers: Number(document.getElementById('rule-max-players').value) || 16,
      startingLives: Number(document.getElementById('rule-start-lives').value) || 2,
      maxLives: Number(document.getElementById('rule-max-lives').value) || 3,
      bonusAlphabet,
    });
  }
  closeRulesModal();
};

// ==================== PARTICLES (POMEGRANATE SEEDS & SPARKS) ====================
const canvas = document.getElementById('particles-canvas');
const ctx = canvas.getContext('2d');
let particles = [];

function resizeCanvas() {
  const pf = document.getElementById('playfield');
  if (!pf) return;
  canvas.width = pf.clientWidth;
  canvas.height = pf.clientHeight;
  if (currentRoom) renderPlayersRing(currentRoom);
}

window.addEventListener('resize', () => {
  if (window.innerWidth >= 900) {
    sidebar.classList.remove('collapsed');
    sidebarBackdrop.classList.add('hidden');
  }
  resizeCanvas();
});

if (typeof ResizeObserver !== 'undefined') {
  const pfEl = document.getElementById('playfield');
  if (pfEl) {
    new ResizeObserver(() => resizeCanvas()).observe(pfEl);
  }
}

setTimeout(resizeCanvas, 100);

function spawnSeeds(count, color) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2.5 + Math.random() * 7;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 3 + Math.random() * 4,
      color,
      life: 1,
    });
  }
}

function updateFuseVisuals() {
  const wick = document.getElementById('fuse-wick-path');
  const spark = document.getElementById('fuse-spark-group');
  const bombCenter = document.getElementById('bomb-center');
  if (!wick || !spark) return;

  const totalLen = wick.getTotalLength();
  if (!currentRoom || currentRoom.phase !== 'playing' || !currentRoom.turnFuseMs) {
    wick.style.strokeDasharray = `${totalLen}`;
    wick.style.strokeDashoffset = '0';
    const endPt = wick.getPointAtLength(totalLen);
    spark.setAttribute('transform', `translate(${endPt.x}, ${endPt.y}) scale(0.7)`);
    return;
  }

  const elapsed = Date.now() - currentRoom.turnStartedAt;
  const total = currentRoom.turnFuseMs;
  const remaining = Math.max(0, total - elapsed);
  const ratio = Math.max(0, Math.min(1, remaining / total));

  // Burn wick from tip (length = totalLen) down toward bomb base (length = 0)
  const burnedLen = totalLen * ratio;
  wick.style.strokeDasharray = `${burnedLen} ${totalLen}`;
  wick.style.strokeDashoffset = '0';

  const pt = wick.getPointAtLength(burnedLen);
  const flicker = 0.85 + Math.sin(Date.now() * 0.03) * 0.25 + (ratio < 0.28 ? 0.35 : 0);
  spark.setAttribute('transform', `translate(${pt.x}, ${pt.y}) scale(${flicker.toFixed(2)})`);

  if (ratio < 0.28) {
    bombCenter.classList.add('critical');
  } else {
    bombCenter.classList.remove('critical');
  }
}

function animateParticles() {
  updateFuseVisuals();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles = particles.filter((p) => p.life > 0.02);
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.14;
    p.life *= 0.94;
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  requestAnimationFrame(animateParticles);
}
animateParticles();
