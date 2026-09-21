// ============================================================================
// ===== 🏆 КЛИЕНТСКОЕ ЛОББИ PvP АРЕНЫ И СОКЕТ-СИНХРОНИЗАЦИЯ (ARENA.JS) =====
// ===== ЧАСТЬ 1 ИЗ 2: ИНИЦИАЛИЗАЦИЯ И СЛУШАТЕЛИ СЕТЕВЫХ PvP СОБЫТИЙ =====
// ============================================================================

let socket = null; 
let localPlayer = null;
let myTimerInterval = null; 
let globalLobbyInterval = null;

function initArenaPage() {
  console.log("🚀 Запуск лобби Арены через защищенный сокет-мост...");
  const parentWindow = window.parent;

  // Безопасно забираем уже подключенный сокет города из родительского WebApp окна
  if (parentWindow && parentWindow.socket) {
    socket = parentWindow.socket;
    setupSocketListeners();
  } else {
    console.warn("⚠️ Прямой сокет родителя отсутствует, пробуем локально...");
    if (typeof io === 'function') {
      socket = io('https://darkworld-server.onrender.com');
      setupSocketListeners();
    }
  }
  
  // Достаем профиль персонажа из локального кэша телефона
  const localSave = localStorage.getItem('rpg_save');
  if (localSave) {
    try { localPlayer = JSON.parse(localSave).player; } catch(e) { console.error(e); }
  }
  
  if (!localPlayer) {
    alert("❌ Профиль персонажа не найден! Вернитесь в город.");
    window.parent.postMessage({ type: 'CLOSE_ARENA_OVERLAY' }, '*');
    return;
  }
  
  setupClickListeners();
  
  // Делаем первый запрос актуального списка дуэлей у сервера при входе
  refreshArenaLobby();
  
  // Автоматически обновляем доску объявлений Арены каждые 4 секунды
  globalLobbyInterval = setInterval(refreshArenaLobby, 4000);
}

function setupSocketListeners() {
  if (!socket) return;
  
  socket.off('arena_lobby_updated');
  socket.off('arena_lobby_data');

  // 🔥 PvP ПЕРЕХВАТЧИК: Ловит сигнал готовности PvP комнаты и уводит WebApp в бой без F5
  socket.on('arena_redirect_to_battle', (data) => {
    console.log("⚔️ PvP Комната сформирована сервером! Мгновенный принудительный переход...");
    
    if (myTimerInterval) clearInterval(myTimerInterval);
    if (globalLobbyInterval) clearInterval(globalLobbyInterval);
    
    // Меняем URL самого верхнего (родительского) окна Telegram WebApp на боевую страницу!
    window.top.location.replace(`battle/battle.html?roomId=${data.roomId}`);
  });
  
  // Сервер сообщает, что список заявок изменился -> обновляем доску
  socket.on('arena_lobby_updated', () => { 
    refreshArenaLobby(); 
  });

  // Получаем свежий срез комнат от сервера и отправляем на отрисовку в UI
  socket.on('arena_lobby_data', (lobbyData) => {
    renderLobbyInterface(lobbyData);
  });
}
// ============================================================================
// ===== 🏆 КЛИЕНТСКОЕ ЛОББИ PvP АРЕНЫ И СОКЕТ-СИНХРОНИЗАЦИЯ (ARENA.JS) =====
// ===== ЧАСТЬ 2 ИЗ 2: ОПЕРАЦИОННЫЙ БЛОК, ТАКТИКА И ИНТЕРФЕЙС ТАБЛИЦЫ =====
// ============================================================================

function setupClickListeners() {
  document.getElementById('create-request-btn')?.addEventListener('click', createMyRequest);
  document.getElementById('cancel-request-btn')?.addEventListener('click', cancelMyRequest);
  
  // Безопасный выход с Арены обратно на площадь города Ашенваль
  const backBtn = document.getElementById('back-to-town-btn') || document.querySelector('.back-btn') || document.querySelector('button');
  if (backBtn) {
    backBtn.addEventListener('click', function(e) {
      e.preventDefault();
      console.log("🏃‍♂️ Покидаем Арену. Полностью глушим фоновые процессы лобби...");
      
      // Глушим таймеры, чтобы Арена перестала спамить сервер запросами каждые 4 секунды
      if (myTimerInterval) clearInterval(myTimerInterval);
      if (globalLobbyInterval) clearInterval(globalLobbyInterval);
      
      // Снимаем слушатели сокетов Арены
      if (socket) {
        socket.off('arena_redirect_to_battle');
        socket.off('arena_lobby_updated');
        socket.off('arena_lobby_data');
      }
      
      // Передаем сигнал в главное окно города: "Закрывай iframe Арены!"
      window.parent.postMessage({ type: 'CLOSE_ARENA_OVERLAY' }, '*');
    });
  }
}

// --- 1. ПУБЛИКАЦИЯ СВОЕГО ВЫЗОВА В ЛОББИ ---
function createMyRequest() {
  if (!socket || !localPlayer) return;
  if (Number(localPlayer.hp || 0) <= 0) return alert("❌ Вы слишком слабы для боя! Излечитесь в городе.");
  
  console.log("🎲 Отправка запроса на создание дуэли бэкенду...");
  socket.emit('arena_create_request', {
    playerData: localPlayer,
    currentHp: Number(localPlayer.hp)
  });
  refreshArenaLobby();
}

// --- 2. ОТМЕНА СВОЕГО ВЫЗОВА В ЛОББИ ---
function cancelMyRequest() {
  if (!socket || !localPlayer) return;
  console.log("❌ Отмена собственной заявки на бой...");
  socket.emit('arena_cancel_request', { userId: localPlayer.id });

  if (myTimerInterval) clearInterval(myTimerInterval);
  
  const sPanel = document.getElementById('my-search-panel');
  const cPanel = document.getElementById('my-create-panel');
  if (sPanel) sPanel.style.display = 'none';
  if (cPanel) cPanel.style.display = 'block';

  refreshArenaLobby();
}

// --- 3. ПРИНЯТИЕ ЧУЖОГО PvP ВЫЗОВА (КНОПКА «В БОЙ») ---
function acceptChallenge(opponentId) {
  if (!socket || !localPlayer) return;
  if (Number(localPlayer.hp || 0) <= 0) return alert("❌ Вы слишком слабы! Излечитесь в городе.");

  console.log(`Target 🎯 Принимаем вызов у игрока ID: ${opponentId}`);
  socket.emit('arena_accept_challenge_request', {
    myId: localPlayer.id,
    opponentId: opponentId,
    playerData: localPlayer,
    currentHp: Number(localPlayer.hp)
  });
}

// --- 4. ЗАПРОС СВЕЖЕГО ЛОББИ С СЕРВЕРА ---
function refreshArenaLobby() {
  if (!socket || !localPlayer) return;
  socket.emit('arena_get_lobby');
}

// --- 5. ВИЗУАЛЬНЫЙ РЕНДЕРИНГ И ТАЙМЕРЫ ОБРАТНОГО ОТСЧЕТА ---
function renderLobbyInterface(lobbyData) {
  if (!localPlayer || !Array.isArray(lobbyData)) return;

  const container = document.getElementById('lobby-list-viewport'); 
  if (!container) return;

  const myId = Number(localPlayer.id);
  const myActiveRequest = lobbyData.find(item => Number(item.id) === myId);

  const sPanel = document.getElementById('my-search-panel');
  const cPanel = document.getElementById('my-create-panel');

  if (myActiveRequest) {
    if (cPanel) cPanel.style.display = 'none';
    if (sPanel) sPanel.style.display = 'block';
    
    let timeLeft = Math.max(0, Math.floor((new Date(myActiveRequest.arena_expires_at) - Date.now()) / 1000));
    if (myTimerInterval) clearInterval(myTimerInterval);
    
    const updateMyTimerText = () => {
      if (timeLeft <= 0) { 
        clearInterval(myTimerInterval); 
        cancelMyRequest(); 
        return; 
      }
      const mins = Math.floor(timeLeft / 60); 
      const secs = timeLeft % 60;
      const tDisplay = document.getElementById('my-timer-display');
      if (tDisplay) tDisplay.textContent = `⏱️ 0${mins}:${secs < 10 ? '0' + secs : secs}`;
      timeLeft--;
    };
    updateMyTimerText(); 
    myTimerInterval = setInterval(updateMyTimerText, 1000);
  } else {
    if (myTimerInterval) clearInterval(myTimerInterval);
    if (sPanel) sPanel.style.display = 'none';
    if (cPanel) cPanel.style.display = 'block';
  }

  // Оставляем на доске только чужие карточки вызовов
  const opponentsRequests = lobbyData.filter(item => Number(item.id) !== myId);
  const counter = document.getElementById('total-requests-counter');
  if (counter) counter.textContent = `Всего: ${opponentsRequests.length}`;
  
  container.innerHTML = '';

  if (opponentsRequests.length === 0) {
    const placeholder = document.createElement('div'); 
    placeholder.className = 'empty-msg';
    placeholder.textContent = '🏰 На Арене тишина... Будь первым, брось вызов!'; 
    container.appendChild(placeholder); 
    return;
  }

  opponentsRequests.forEach(opp => {
    let timeLeft = Math.max(0, Math.floor((new Date(opp.arena_expires_at) - Date.now()) / 1000));
    const mins = Math.floor(timeLeft / 60); 
    const secs = timeLeft % 60;
    
    const card = document.createElement('div'); 
    card.className = 'user-card';
    card.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 2px;">
        <div style="font-weight: bold; font-size: 15px; color: #ffffff;">${opp.name} <span style="color: #f1c40f; font-size: 12px; font-weight: normal; margin-left: 4px;">Lv. ${opp.level}</span></div>
        <div style="font-size: 12px; color: var(--hint);">❤️ ${opp.hp} ед.</div>
      </div>
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-family: monospace; font-size: 14px; color: #ffc048; font-weight: bold;">⏱️ 0${mins}:${secs < 10 ? '0' + secs : secs}</span>
        <button class="action-btn btn-accept" data-opp-id="${opp.id}">В БОЙ</button>
      </div>
    `;
    
    card.querySelector('.btn-accept').addEventListener('click', function() {
      acceptChallenge(this.getAttribute('data-opp-id'));
    });
    
    container.appendChild(card);
  });
}

window.addEventListener('browse_arena', () => { console.log('Переключение контекста...'); });
window.addEventListener('DOMContentLoaded', initArenaPage);