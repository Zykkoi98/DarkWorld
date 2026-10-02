// ============================================================================
// ===== 🏆 КЛИЕНТ АРЕНЫ (ARENA_CORE.JS) — v12 =====
// ===== Групповые бои: табы, команды A/B, N×N =====
// ============================================================================

let socket = null;
let localPlayer = null;
let myTimerInterval = null;
let globalLobbyInterval = null;
let myActiveRequest = null;
let currentTab = 'duel';   // 'duel' | 'group' | 'chaos'

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================================
function initArenaPage() {
  console.log('🚀 [ARENA] Запуск лобби...');

  const parentWindow = window.parent;

  if (parentWindow && parentWindow !== window && parentWindow.player) {
    localPlayer = parentWindow.player;
  } else {
    const localSave = localStorage.getItem('rpg_save');
    if (localSave) {
      try { localPlayer = JSON.parse(localSave).player; } catch(e) {}
    }
  }

  if (!localPlayer) {
    console.warn('⚠️ [ARENA] Профиль не найден');
    return;
  }

  const bindToParentSocket = () => {
    const parentSocket = parentWindow?.socket;

    // 🔥 Проверка: сокет должен быть живым (connected + есть id + не disconnected)
    const isAlive = parentSocket
      && parentSocket.connected === true
      && parentSocket.id
      && parentSocket.io?._readyState === 'open';

    if (isAlive) {
      socket = parentSocket;
      console.log('✅ [ARENA] Привязан к сокету города');
      setupSocketListeners();
      refreshLobby();
      socket.emit('arena_check_my_request');
      return true;
    }

    if (parentSocket) {
      console.warn('⚠️ [ARENA] Сокет родителя не готов:', {
        connected: parentSocket.connected,
        id: parentSocket.id,
        state: parentSocket.io?._readyState
      });
    }

    return false;
  };

  if (!bindToParentSocket()) {
    const waitForSocket = setInterval(() => {
      if (bindToParentSocket()) clearInterval(waitForSocket);
    }, 300);
  }

  setupClickListeners();
  setupTabs();
  setupModeModal();

  globalLobbyInterval = setInterval(refreshLobby, 5000);
  // 🔥 ПЕРИОДИЧЕСКАЯ ПРОВЕРКА СОКЕТА
  // Каждые 5 сек проверяем что сокет жив. Если отвалился — переподключаемся к родителю.
  setInterval(() => {
    const isAlive = socket
      && socket.connected
      && socket.io?._readyState === 'open';

    if (!isAlive) {
      console.warn('⚠️ [ARENA] Сокет отвалился — пробуем переподключиться');

      const parentSocket = window.parent?.socket;
      if (parentSocket && parentSocket.connected) {
        socket = parentSocket;
        setupSocketListeners();
        refreshLobby();
        console.log('✅ [ARENA] Переподключились к родительскому сокету');
      }
    }
  }, 5000);
}


// ============================================================================
// СОКЕТ-СЛУШАТЕЛИ
// ============================================================================
const onLobbyUpdated = () => refreshLobby();

const onLobbyData = (lobbyData) => {
  renderLobby(lobbyData);
};

const onRequestJoined = (data) => {
  console.log('✅ [ARENA] Присоединились:', data);
  refreshLobby();
};

const onRequestCancelled = (data) => {
  console.log('❌ [ARENA] Заявка отменена:', data.reason || '');
  showToast(data.reason || 'Заявка отменена', 'warning');
  myActiveRequest = null;
  window.__myRequestJustCreated = false;
  try { localStorage.removeItem('arena_active'); } catch(e) {}
  refreshLobby();
};

const onArenaError = (msg) => {
  console.error('🚨 [ARENA]', msg);
  showToast(msg, 'error');
  window.__myRequestJustCreated = false;
  try { localStorage.removeItem('arena_active'); } catch(e) {}
};

const onLobbyUpdatedSelf = (data) => {
  if (data && data.restored) {
    console.log('✅ [ARENA] Заявка восстановлена после F5');
    showToast('✅ Ваша заявка восстановлена', 'success');
    window.__myRequestJustCreated = true;
    try { localStorage.setItem('arena_active', 'true'); } catch(e) {}
  } else {
    console.log('ℹ️ [ARENA] Активной заявки не найдено');
    window.__myRequestJustCreated = false;
    try { localStorage.removeItem('arena_active'); } catch(e) {}
  }
  refreshLobby();
};

const onRedirectToBattle = (data) => {
  console.log('⚔️ [ARENA] Редирект в бой:', data.roomId);

  const currentPath = window.location.pathname;
  let projectRoot = currentPath.replace(/\/[^/]*$/, '');
  if (currentPath.includes('/battle/'))  projectRoot = currentPath.split('/battle/')[0];
  else if (currentPath.includes('/shop/'))   projectRoot = currentPath.split('/shop/')[0];
  else if (currentPath.includes('/tower/'))  projectRoot = currentPath.split('/tower/')[0];
  else if (currentPath.includes('/world/'))  projectRoot = currentPath.split('/world/')[0];
  else if (currentPath.includes('/arena/'))  projectRoot = currentPath.split('/arena/')[0];

  const userId = localPlayer?.id || '';
  const url = `${projectRoot}/battle/battle.html?roomId=${data.roomId}&battleType=arena_pvp&userId=${userId}`;

  console.log('🌐 [ARENA] URL:', url);
  window.location.replace(url);
};

function setupSocketListeners() {
  if (!socket) return;

  socket.off('arena_lobby_updated', onLobbyUpdated);
  socket.off('arena_lobby_data', onLobbyData);
  socket.off('arena_request_joined', onRequestJoined);
  socket.off('arena_request_cancelled', onRequestCancelled);
  socket.off('arena_error', onArenaError);
  socket.off('arena_redirect_to_battle', onRedirectToBattle);
  socket.off('arena_lobby_updated_self', onLobbyUpdatedSelf);

  socket.on('arena_lobby_updated', onLobbyUpdated);
  socket.on('arena_lobby_data', onLobbyData);
  socket.on('arena_request_joined', onRequestJoined);
  socket.on('arena_request_cancelled', onRequestCancelled);
  socket.on('arena_error', onArenaError);
  socket.on('arena_redirect_to_battle', onRedirectToBattle);
  socket.on('arena_lobby_updated_self', onLobbyUpdatedSelf);
}

// ============================================================================
// ТАБЫ
// ============================================================================
function setupTabs() {
  document.querySelectorAll('.arena-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.classList.contains('disabled')) return;
      const t = tab.dataset.tab;
      if (!t) return;

      currentTab = t;

      document.querySelectorAll('.arena-tab').forEach(x => x.classList.remove('active'));
      tab.classList.add('active');

      // Обновляем заголовок списка
      const titles = {
        duel: 'ОТКРЫТЫЕ ДУЭЛИ:',
        group: 'ОТКРЫТЫЕ ГРУППОВЫЕ ЗАЯВКИ:',
        chaos: 'ОТКРЫТЫЕ ЗАЯВКИ ХАОСА:'
      };
      const titleEl = document.getElementById('lobby-list-title');
      if (titleEl) titleEl.textContent = titles[t] || 'ОТКРЫТЫЕ ВЫЗОВЫ:';

      refreshLobby();
    });
  });
}

// ============================================================================
// КЛИКИ
// ============================================================================
function setupClickListeners() {
  document.getElementById('create-request-btn')?.addEventListener('click', () => {
    document.getElementById('mode-modal').classList.add('active');
  });

  document.getElementById('cancel-request-btn')?.addEventListener('click', () => {
    if (!socket) return;
    socket.emit('arena_cancel_request');
    myActiveRequest = null;
    refreshLobby();
  });

  document.getElementById('back-btn')?.addEventListener('click', (e) => {
    e.preventDefault();

    if (myActiveRequest || window.__myRequestJustCreated) {
      showToast('❌ Нельзя выйти с Арены! Сначала отмените заявку.', 'warning');
      return;
    }

    try { localStorage.removeItem('arena_active'); } catch(e) {}

    cleanup();
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'CLOSE_ARENA_OVERLAY' }, '*');
    } else {
      window.location.href = '../index.html';
    }
  });
}

function setupModeModal() {
  const modal = document.getElementById('mode-modal');
  if (!modal) return;

  document.getElementById('close-mode-modal')?.addEventListener('click', () => {
    modal.classList.remove('active');
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('active');
  });

  modal.querySelectorAll('.mode-option').forEach(opt => {
    opt.addEventListener('click', () => {
      if (opt.classList.contains('disabled')) return;
      const mode = opt.dataset.mode;
      if (!mode) return;

      console.log('🎲 [ARENA] Создаём заявку:', mode);

      // 🔥 ПРОВЕРКА СОКЕТА
      if (!socket || !socket.connected || socket.io?._readyState !== 'open') {
        console.warn('⚠️ [ARENA] Сокет не готов — переподключаемся');

        // Пытаемся взять свежий сокет у родителя
        const parentSocket = window.parent?.socket;
        if (parentSocket && parentSocket.connected) {
          socket = parentSocket;
          setupSocketListeners();
        }

        // Если всё ещё мёртв — ошибка
        if (!socket || !socket.connected) {
          showToast('❌ Соединение потеряно. Обновите страницу (F5).', 'error');
          return;
        }
      }

      window.__myRequestJustCreated = true;
      try { localStorage.setItem('arena_active', 'true'); } catch(e) {}

      socket.emit('arena_create_request', { mode });
      modal.classList.remove('active');
    });
  });
}

// ============================================================================
// ДЕЙСТВИЯ
// ============================================================================
function refreshLobby() {
  if (!socket || !socket.connected) return;
  socket.emit('arena_get_lobby');
}

function acceptChallenge(ownerId, team) {
  if (!socket) return;
  if (Number(localPlayer?.hp || 0) <= 0) {
    return showToast('❌ Вы слишком слабы! Излечитесь в городе.', 'error');
  }

  // 🔥 Для дуэли 1×1 — автоматически команда B
  let finalTeam = team;
  if (!finalTeam) {
    finalTeam = 'B';   // создатель уже в A, значит присоединившийся — в B
  }

  console.log('🎯 [ARENA] Присоединяемся к:', ownerId, 'команда:', finalTeam);
  socket.emit('arena_join_request', { ownerId: Number(ownerId), team: finalTeam });
}

// ============================================================================
// ФИЛЬТРАЦИЯ ПО ТАБУ
// ============================================================================
function matchesTab(mode, tab) {
  if (tab === 'duel') return mode === 'duel_1v1';
  if (tab === 'group') return mode.startsWith('group_');
  if (tab === 'chaos') return mode.startsWith('chaos_');
  return true;
}

// ============================================================================
// РЕНДЕР
// ============================================================================
function renderLobby(lobbyData) {
  if (!localPlayer || !Array.isArray(lobbyData)) return;

  const myId = Number(localPlayer.id);

  myActiveRequest = lobbyData.find(room =>
    room.members.some(m => Number(m.id) === myId)
  ) || null;

  const sPanel = document.getElementById('my-search-panel');
  const cPanel = document.getElementById('my-create-panel');

  if (myActiveRequest) {
    try { localStorage.setItem('arena_active', 'true'); } catch(e) {}

    if (cPanel) cPanel.style.display = 'none';
    if (sPanel) sPanel.style.display = 'block';

    renderMyRequest(myActiveRequest, myId);
    startMyTimer(myActiveRequest.expiresAt);
  } else {
    if (!window.__myRequestJustCreated) {
      try { localStorage.removeItem('arena_active'); } catch(e) {}
    }

    if (myTimerInterval) clearInterval(myTimerInterval);
    if (sPanel) sPanel.style.display = 'none';
    if (cPanel) cPanel.style.display = 'block';
  }

  // Список чужих заявок (с фильтром по табу)
  const opponents = lobbyData.filter(room =>
    !room.members.some(m => Number(m.id) === myId) &&
    matchesTab(room.mode, currentTab)
  );

  const counter = document.getElementById('total-requests-counter');
  if (counter) counter.textContent = `Всего: ${opponents.length}`;

  const container = document.getElementById('lobby-list-viewport');
  if (!container) return;
  container.innerHTML = '';

  if (opponents.length === 0) {
    const placeholder = document.createElement('div');
    placeholder.className = 'empty-msg';
    placeholder.textContent = currentTab === 'duel'
      ? '⚔️ Нет открытых дуэлей. Создай свою!'
      : currentTab === 'group'
        ? '👥 Нет открытых групповых заявок. Создай свою!'
        : '🌀 Скоро!';
    container.appendChild(placeholder);
    return;
  }

  opponents.forEach(room => {
    const card = renderLobbyCard(room, myId);
    container.appendChild(card);
  });
}

// ============================================================================
// СВОЯ ЗАЯВКА — КОМПАКТНАЯ
// ============================================================================
function renderMyRequest(room, myId) {
  const isOwner = Number(room.ownerId) === myId;
  const teamSize = room.teamSize;
  const isDuel = room.mode === 'duel_1v1';

  document.getElementById('my-mode-text').textContent = formatMode(room.mode);

  const teamColumnsEl = document.getElementById('my-team-columns');
  const progressSimpleEl = document.getElementById('my-progress-simple');

  if (isDuel) {
    // Дуэль — простой прогресс
    if (teamColumnsEl) teamColumnsEl.style.display = 'none';
    if (progressSimpleEl) {
      progressSimpleEl.style.display = 'block';
      progressSimpleEl.textContent = `Ожидание: ${room.currentCount} / ${room.maxPlayers}`;
    }
  } else {
    // N×N — две колонки
    if (teamColumnsEl) teamColumnsEl.style.display = 'flex';
    if (progressSimpleEl) progressSimpleEl.style.display = 'none';

    renderTeamColumn('a', room.teamA, teamSize);
    renderTeamColumn('b', room.teamB, teamSize);
  }

  const cancelBtn = document.getElementById('cancel-request-btn');
  if (cancelBtn) {
    cancelBtn.textContent = isOwner ? '✕ ОТМЕНИТЬ ЗАЯВКУ' : '✕ ВЫЙТИ ИЗ КОМАНДЫ';
  }
}

function renderTeamColumn(team, members, teamSize) {
  const container = document.getElementById(`my-team-${team}-members`);
  const counter = document.getElementById(`my-team-${team}-count`);
  if (!container || !counter) return;

  counter.textContent = `${members.length} / ${teamSize}`;

  container.innerHTML = '';

  if (members.length === 0) {
    container.innerHTML = '<div class="team-col-empty">пусто</div>';
    return;
  }

  members.forEach(m => {
    const el = document.createElement('div');
    el.className = 'team-col-member';
    el.textContent = `👤 ${m.name} (Lv ${m.level})`;
    container.appendChild(el);
  });
}

// ============================================================================
// КАРТОЧКА ЗАЯВКИ В ЛОББИ
// ============================================================================
function renderLobbyCard(room, myId) {
  const card = document.createElement('div');
  card.className = 'user-card';

  const timeLeft = Math.max(0, Math.floor((room.expiresAt - Date.now()) / 1000));
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const timeStr = `⏱️ 0${mins}:${secs < 10 ? '0' + secs : secs}`;

  const isDuel = room.mode === 'duel_1v1';

  let headerHtml = `
    <div>
      <div class="card-mode">${formatMode(room.mode)}</div>
      <div class="card-owner">${room.ownerName}
        <span class="card-owner-level">Lv. ${room.ownerLevel}</span>
      </div>
    </div>
    <div class="card-timer">${timeStr}</div>
  `;

  let teamsHtml = '';
  if (!isDuel) {
    // Две колонки команд
    teamsHtml = `
      <div class="team-columns">
        <div class="team-col team-a">
          <div class="team-col-title">
            <span>A</span>
            <span>${room.teamACount} / ${room.teamSize}</span>
          </div>
          ${renderMembersList(room.teamA)}
        </div>
        <div class="team-col team-b">
          <div class="team-col-title">
            <span>B</span>
            <span>${room.teamBCount} / ${room.teamSize}</span>
          </div>
          ${renderMembersList(room.teamB)}
        </div>
      </div>
    `;
  } else {
    // Дуэль — простой счётчик
    teamsHtml = `<div style="font-size: 11px; color: var(--hint); text-align: center; margin: 6px 0;">👥 ${room.currentCount} / ${room.maxPlayers}</div>`;
  }

  let actionsHtml = '';
  if (isDuel) {
    actionsHtml = `
      <div class="card-actions">
        <button class="action-btn btn-accept" data-owner-id="${room.ownerId}" data-team="">
          ⚔️ В БОЙ
        </button>
      </div>
    `;
  } else {
    // Две кнопки команд
    const aFull = room.teamACount >= room.teamSize;
    const bFull = room.teamBCount >= room.teamSize;

    actionsHtml = `
      <div class="card-actions">
        <button class="action-btn btn-team-a" data-owner-id="${room.ownerId}" data-team="A" ${aFull ? 'disabled style="opacity:0.4;"' : ''}>
          🔵 В команду A
        </button>
        <button class="action-btn btn-team-b" data-owner-id="${room.ownerId}" data-team="B" ${bFull ? 'disabled style="opacity:0.4;"' : ''}>
          🔴 В команду B
        </button>
      </div>
    `;
  }

  card.innerHTML = `
    <div class="card-header">${headerHtml}</div>
    ${teamsHtml}
    ${actionsHtml}
  `;

  card.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const ownerId = this.getAttribute('data-owner-id');
      const team = this.getAttribute('data-team');
      acceptChallenge(ownerId, team || null);
    });
  });

  return card;
}

function renderMembersList(members) {
  if (!members || members.length === 0) {
    return '<div class="team-col-empty">пусто</div>';
  }
  return members.map(m =>
    `<div class="team-col-member">👤 ${m.name} (Lv ${m.level})</div>`
  ).join('');
}

function formatMode(mode) {
  const map = {
    'duel_1v1':  '⚔️ Дуэль 1×1',
    'group_2v2': '👥 Групповой 2×2',
    'group_3v3': '👥 Групповой 3×3',
    'group_5v5': '👥 Групповой 5×5',
    'chaos_10':  '🌀 Хаос'
  };
  return map[mode] || mode;
}

// ============================================================================
// ТАЙМЕР СВОЕЙ ЗАЯВКИ
// ============================================================================
function startMyTimer(expiresAt) {
  if (myTimerInterval) clearInterval(myTimerInterval);

  const el = document.getElementById('my-timer-display');
  if (!el) return;

  const update = () => {
    const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    if (left <= 0) {
      clearInterval(myTimerInterval);
      el.textContent = '⏱️ 00:00';
      return;
    }
    const m = Math.floor(left / 60);
    const s = left % 60;
    el.textContent = `⏱️ 0${m}:${s < 10 ? '0' + s : s}`;
  };

  update();
  myTimerInterval = setInterval(update, 1000);
}

// ============================================================================
// УТИЛИТЫ
// ============================================================================
function showToast(msg, type = 'info') {
  const old = document.getElementById('arena-toast');
  if (old) old.remove();

  const colors = {
    success: 'linear-gradient(135deg, #2ecc71, #27ae60)',
    error:   'linear-gradient(135deg, #e74c3c, #c0392b)',
    warning: 'linear-gradient(135deg, #f39c12, #e67e22)',
    info:    'linear-gradient(135deg, #3498db, #2980b9)'
  };

  const toast = document.createElement('div');
  toast.id = 'arena-toast';
  toast.style.cssText = `
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    background: ${colors[type] || colors.info};
    color: #fff; padding: 12px 20px; border-radius: 12px;
    font-weight: bold; font-size: 13px; z-index: 99999;
    max-width: 320px; text-align: center;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3000);
}

function cleanup() {
  if (myTimerInterval) clearInterval(myTimerInterval);
  if (globalLobbyInterval) clearInterval(globalLobbyInterval);

  if (socket) {
    socket.off('arena_lobby_updated', onLobbyUpdated);
    socket.off('arena_lobby_data', onLobbyData);
    socket.off('arena_request_joined', onRequestJoined);
    socket.off('arena_request_cancelled', onRequestCancelled);
    socket.off('arena_error', onArenaError);
    socket.off('arena_redirect_to_battle', onRedirectToBattle);
    socket.off('arena_lobby_updated_self', onLobbyUpdatedSelf);
  }
}

Object.defineProperty(window, 'myActiveRequest', {
  get: () => myActiveRequest
});

window.addEventListener('beforeunload', cleanup);
window.addEventListener('DOMContentLoaded', initArenaPage);