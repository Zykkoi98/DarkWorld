// ============================================================================
// ===== 🏆 КЛИЕНТ АРЕНЫ (ARENA_CORE.JS) =====
// ===== Лобби, заявки, редирект в бой =====
// ============================================================================

let socket = null;
let localPlayer = null;
let myTimerInterval = null;
let globalLobbyInterval = null;
let myActiveRequest = null;   // моя текущая заявка (если есть)

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================================
function initArenaPage() {
  console.log('🚀 [ARENA] Запуск лобби...');

  const parentWindow = window.parent;

  // Загружаем профиль
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

  // Привязка к сокету родителя
  const bindToParentSocket = () => {
    if (parentWindow && parentWindow !== window && parentWindow.socket && parentWindow.socket.connected) {
      socket = parentWindow.socket;
      console.log('✅ [ARENA] Привязан к сокету города');
      setupSocketListeners();
      refreshLobby();
      socket.emit('arena_check_my_request');   // ← ДОБАВЛЕНО: проверяем, я в лобби?
      return true;
    }
    return false;
  };

  if (!bindToParentSocket()) {
    const waitForSocket = setInterval(() => {
      if (bindToParentSocket()) clearInterval(waitForSocket);
    }, 300);
  }

  setupClickListeners();
  setupModeModal();

  // Автообновление каждые 5 сек (страховка на случай пропущенных событий)
  globalLobbyInterval = setInterval(refreshLobby, 5000);
}

// ============================================================================
// СОКЕТ-СЛУШАТЕЛИ
// ============================================================================
const onLobbyUpdated = () => refreshLobby();

const onLobbyData = (lobbyData) => {
  renderLobby(lobbyData);
};

const onRequestJoined = (data) => {
  console.log('✅ [ARENA] Присоединились к комнате:', data.ownerId);
  refreshLobby();
};

const onRequestCancelled = (data) => {
  console.log('❌ [ARENA] Заявка отменена:', data.reason || '');
  showToast(data.reason || 'Заявка отменена', 'warning');
  myActiveRequest = null;
  window.__myRequestJustCreated = false;   // 🔥 снимаем флаг
  refreshLobby();
};
const onLobbyUpdatedSelf = (data) => {
  if (data && data.restored) {
    console.log('✅ [ARENA] Заявка восстановлена после F5');
    showToast('✅ Ваша заявка восстановлена', 'success');
    window.__myRequestJustCreated = true;
  } else {
    console.log('ℹ️ [ARENA] Активной заявки не найдено');
    window.__myRequestJustCreated = false;
  }
  refreshLobby();
};
const onArenaError = (msg) => {
  console.error('🚨 [ARENA]', msg);
  showToast(msg, 'error');
  // 🔥 Если ошибка — сбрасываем флаг создания
  window.__myRequestJustCreated = false;
};

const onRedirectToBattle = (data) => {
  console.log('⚔️ [ARENA] Редирект в бой:', data.roomId);

  const currentPath = window.location.pathname;
  let projectRoot = currentPath.replace(/\/[^/]*$/, '');
  if (currentPath.includes('/battle/'))  projectRoot = currentPath.split('/battle/')[0];
  else if (currentPath.includes('/shop/'))   projectRoot = currentPath.split('/shop/')[0];
  else if (currentPath.includes('/tower/'))  projectRoot = currentPath.split('/tower/')[0];
  else if (currentPath.includes('/world/'))  projectRoot = currentPath.split('/world/')[0];
  else if (currentPath.includes('/arena/'))  projectRoot = currentPath.split('/arena/')[0];   // ← НОВОЕ

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
  socket.off('arena_lobby_updated_self', onLobbyUpdatedSelf);   // ← ДОБАВЛЕНО

  socket.on('arena_lobby_updated', onLobbyUpdated);
  socket.on('arena_lobby_data', onLobbyData);
  socket.on('arena_request_joined', onRequestJoined);
  socket.on('arena_request_cancelled', onRequestCancelled);
  socket.on('arena_error', onArenaError);
  socket.on('arena_redirect_to_battle', onRedirectToBattle);
  socket.on('arena_lobby_updated_self', onLobbyUpdatedSelf);    // ← ДОБАВЛЕНО
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

    // 🔥 БЛОКИРОВКА: заявка есть в памяти ИЛИ создана локально
    if (myActiveRequest || window.__myRequestJustCreated) {
      showToast('❌ Нельзя выйти с Арены! Сначала отмените заявку.', 'warning');
      return;
    }

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
      if (!socket) return;

      // 🔥 Ставим флаг СРАЗУ — блокируем выход до подтверждения сервера
      window.__myRequestJustCreated = true;

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

function acceptChallenge(ownerId) {
  if (!socket) return;
  if (Number(localPlayer?.hp || 0) <= 0) {
    return showToast('❌ Вы слишком слабы! Излечитесь в городе.', 'error');
  }
  console.log('🎯 [ARENA] Присоединяемся к:', ownerId);
  socket.emit('arena_join_request', { ownerId: Number(ownerId) });
}

// ============================================================================
// РЕНДЕР
// ============================================================================
function renderLobby(lobbyData) {
  if (!localPlayer || !Array.isArray(lobbyData)) return;

  const myId = Number(localPlayer.id);

  // Находим свою заявку
  myActiveRequest = lobbyData.find(room =>
    room.members.some(m => Number(m.id) === myId)
  ) || null;

  const sPanel = document.getElementById('my-search-panel');
  const cPanel = document.getElementById('my-create-panel');

  // --- Режим: у меня есть активная заявка ---
  if (myActiveRequest) {
    if (cPanel) cPanel.style.display = 'none';
    if (sPanel) sPanel.style.display = 'block';

    const isOwner = Number(myActiveRequest.ownerId) === myId;

    document.getElementById('my-mode-text').textContent = formatMode(myActiveRequest.mode);
    document.getElementById('my-progress-text').textContent =
      `Ожидание: ${myActiveRequest.currentCount} / ${myActiveRequest.maxPlayers}`;

    const cancelBtn = document.getElementById('cancel-request-btn');
    if (cancelBtn) {
      cancelBtn.textContent = isOwner ? '✕ ОТМЕНИТЬ ЗАЯВКУ' : '✕ ВЫЙТИ ИЗ КОМНАТЫ';
    }

    startMyTimer(myActiveRequest.expiresAt);
  } else {
    if (myTimerInterval) clearInterval(myTimerInterval);
    if (sPanel) sPanel.style.display = 'none';
    if (cPanel) cPanel.style.display = 'block';
  }

  // --- Список чужих заявок ---
  const opponents = lobbyData.filter(room =>
    !room.members.some(m => Number(m.id) === myId)
  );

  const counter = document.getElementById('total-requests-counter');
  if (counter) counter.textContent = `Всего: ${opponents.length}`;

  const container = document.getElementById('lobby-list-viewport');
  if (!container) return;
  container.innerHTML = '';

  if (opponents.length === 0) {
    const placeholder = document.createElement('div');
    placeholder.className = 'empty-msg';
    placeholder.textContent = '🏰 На Арене тишина... Будь первым, брось вызов!';
    container.appendChild(placeholder);
    return;
  }

  opponents.forEach(room => {
    const card = document.createElement('div');
    card.className = 'user-card';

    const timeLeft = Math.max(0, Math.floor((room.expiresAt - Date.now()) / 1000));
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;

    const isFull = room.currentCount >= room.maxPlayers;

    card.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 3px;">
        <div style="font-weight: bold; font-size: 14px; color: #a29bfe;">${formatMode(room.mode)}</div>
        <div style="font-weight: bold; font-size: 15px; color: #ffffff;">${room.ownerName}
          <span style="color: #f1c40f; font-size: 12px; font-weight: normal; margin-left: 4px;">Lv. ${room.ownerLevel}</span>
        </div>
        <div style="font-size: 11px; color: var(--hint);">
          👥 ${room.currentCount} / ${room.maxPlayers}
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-family: monospace; font-size: 14px; color: #ffc048; font-weight: bold;">
          ⏱️ 0${mins}:${secs < 10 ? '0' + secs : secs}
        </span>
        <button class="action-btn btn-accept" data-owner-id="${room.ownerId}" ${isFull ? 'disabled style="opacity:0.4;"' : ''}>
          ${isFull ? 'ЗАПОЛНЕНО' : 'В БОЙ'}
        </button>
      </div>
    `;

    const btn = card.querySelector('.btn-accept');
    if (btn && !isFull) {
      btn.addEventListener('click', function() {
        acceptChallenge(this.getAttribute('data-owner-id'));
      });
    }

    container.appendChild(card);
  });
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
    socket.off('arena_lobby_updated_self', onLobbyUpdatedSelf);   // ← ДОБАВЛЕНО
  }
}

window.addEventListener('beforeunload', cleanup);
// 🔥 Экспортируем myActiveRequest для родителя (game.js)
Object.defineProperty(window, 'myActiveRequest', {
  get: () => myActiveRequest
}); 
window.addEventListener('DOMContentLoaded', initArenaPage);