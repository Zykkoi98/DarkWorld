// ============================================================================
// ===== 🛡️ ЗАЩИЩЕННОЕ КЛИЕНТСКОЕ ЯДРО АРЕНЫ: БЕЗ API КЛЮЧЕЙ БД =====
// ============================================================================
let socket = null; 
let localPlayer = null;
let myTimerInterval = null; 
let globalLobbyInterval = null;

function initArenaPage() {
  console.log("🚀 Запуск лобби Арены через защищенный сокет-мост...");
  
  const parentWindow = window.parent;

  // Забираем уже подключенный безопасный сокет из города (родительского окна)
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
  
  // Безопасно достаем профиль игрока из локального кэша устройства
  const localSave = localStorage.getItem('rpg_save');
  if (localSave) {
    try { localPlayer = JSON.parse(localSave).player; } catch(e) { console.error(e); }
  }
  
  if (!localPlayer) {
    alert("❌ Профиль персонажа не найден! Вернитесь в город.");
    location.href = 'index.html'; 
    return;
  }
  
  setupClickListeners();
  
  // Запрашиваем актуальный список дуэлей у сервера при входе
  refreshArenaLobby();
  
  // Раз в 4 секунды бэкенд будет присылать нам обновления доски объявлений
  globalLobbyInterval = setInterval(refreshArenaLobby, 4000);
}

function setupSocketListeners() {
  if (!socket) return;
  
  socket.off('arena_redirect_to_battle');
  socket.off('arena_lobby_updated');
  socket.off('arena_lobby_data');

  // 🔥 ГЛАВНЫЙ PvP ПЕРЕХВАТЧИК: Взламывает песочницу iframe и уводит телефон в бой без F5
  socket.on('arena_redirect_to_battle', (data) => {
    console.log("⚔️ PvP Комната готова! Мгновенный принудительный переход...");
    
    if (myTimerInterval) clearInterval(myTimerInterval);
    if (globalLobbyInterval) clearInterval(globalLobbyInterval);
    
    // Меняем URL самого верхнего (родительского) окна Telegram WebApp напрямую!
    window.top.location.replace(`battle/battle.html?roomId=${data.roomId}`);
  });
  
  socket.on('arena_lobby_updated', () => { 
    refreshArenaLobby(); 
  });

  socket.on('arena_lobby_data', (lobbyData) => {
    renderLobbyInterface(lobbyData);
  });
}

function closeArenaAndStartBattle(roomId) {
  if (myUuid) clearInterval(myTimerInterval);
  if (globalLobbyInterval) clearInterval(globalLobbyInterval);
  
  // Просто отправляем родителю команду: "Переключи экран на этот roomId"
  window.parent.postMessage({ 
    type: 'START_ARENA_BATTLE', 
    roomId: roomId 
  }, '*');
}

function setupClickListeners() {
  document.getElementById('create-request-btn')?.addEventListener('click', createMyRequest);
  document.getElementById('cancel-request-btn')?.addEventListener('click', cancelMyRequest);
   // 🔥 ФИКС КНОПКИ "В ГОРОД": Находим кнопку возврата в город на Арене
  // Код сам попытается найти кнопку по классу или тексту
  const backBtn = document.getElementById('back-to-town-btn') || document.querySelector('.back-btn') || document.querySelector('button');
  
  if (backBtn) {
    backBtn.addEventListener('click', function(e) {
      e.preventDefault();
      console.log("🏃‍♂️ Нажата кнопка 'В город'. Полностью глушим лобби Арены...");
      
      // 1. Убиваем таймеры, чтобы Арена перестала слать запросы на сервер каждые 4 секунды
      if (myTimerInterval) clearInterval(myTimerInterval);
      if (globalLobbyInterval) clearInterval(globalLobbyInterval);
      
      // 2. Отключаем слушатели сокетов Арены
      if (socket) {
        socket.off('arena_redirect_to_battle');
        socket.off('arena_lobby_updated');
        socket.off('arena_lobby_data');
      }
      
      // 3. Передаем сигнал в главное окно города: "Закрывай экран Арены!"
      window.parent.postMessage({ type: 'CLOSE_ARENA_OVERLAY' }, '*');
    });
  }
}

// ============================================================================
// ===== 🧠 ЗАКРЫТЫЙ ОПЕРАЦИОННЫЙ БЛОК ЛОББИ PvP (ОБЩЕНИЕ ЧЕРЕЗ СОКЕТЫ) =====
// ============================================================================

/**
 * 1. ПУБЛИКАЦИЯ СВОЕГО ВЫЗОВА
 * Вместо прямой записи upsert в Supabase отправляем запрос на бэкенд
 */
function createMyRequest() {
  if (!socket || !localPlayer) return;
  if (Number(localPlayer.hp || 0) <= 0) return alert("Вы слишком слабы для боя! Излечитесь в городе.");
  
  console.log("🎲 Отправка запроса на создание дуэли бэкенду...");
  
  // Сервер сам рассчитает время экспирации (3 минуты) и запишет заявку в БД
  socket.emit('arena_create_request', {
    playerData: localPlayer,
    currentHp: Number(localPlayer.hp)
  });
  
  refreshArenaLobby();
}

/**
 * 2. ОТМЕНА СВОЕГО ВЫЗОВА
 * Просим бэкенд удалить нашу строчку из очереди
 */
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

/**
 * 3. ПРИНЯТИЕ ЧУЖОГО ВЫЗОВА (КНОПКА «В БОЙ»)
 * Сигнализируем серверу, с кем именно мы хотим скрестить мечи
 */
function acceptChallenge(opponentId) {
  if (!socket || !localPlayer) return;
  if (Number(localPlayer.hp || 0) <= 0) return alert("Вы слишком слабы! Излечитесь в городе.");

  console.log(`🎯 Пытаюсь принять вызов у игрока ID: ${opponentId}`);

  // Сервер проверит атомарность транзакции удаления в БД. 
  // Кто первый отправил сокет-сигнал — тот и заходит в созданную PvP-комнату.
  socket.emit('arena_accept_challenge_request', {
    myId: localPlayer.id,
    opponentId: opponentId,
    playerData: localPlayer,
    currentHp: Number(localPlayer.hp)
  });
}

/**
 * 4. ЗАПРОС ОБНОВЛЕНИЯ ТАБЛИЦЫ
 * Просто дергаем сервер, чтобы он выдал текущий срез лобби
 */
function refreshArenaLobby() {
  if (!socket || !localPlayer) return;
  socket.emit('arena_get_lobby');
}

/**
 * 5. ВИЗУАЛЬНЫЙ РЕНДЕРИНГ СЕТКИ И ТАЙМЕРОВ
 */
function renderLobbyInterface(lobbyData) {
  if (!localPlayer || !Array.isArray(lobbyData)) return;

  const container = document.getElementById('lobby-list-viewport'); 
  if (!container) return;

  const myId = Number(localPlayer.id);
  // Ищем, опубликована ли сейчас наша собственная заявка
  const myActiveRequest = lobbyData.find(item => Number(item.id) === myId);

  const sPanel = document.getElementById('my-search-panel');
  const cPanel = document.getElementById('my-create-panel');

  if (myActiveRequest) {
    if (cPanel) cPanel.style.display = 'none';
    if (sPanel) sPanel.style.display = 'block';
    
    // Вычисляем оставшееся время до автоматического снятия заявки
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

  // Фильтруем список, оставляя только чужие заявки
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

  // Выводим карточки оппонентов
  opponentsRequests.forEach(opp => {
    const timeLeft = Math.max(0, Math.floor((new Date(opp.arena_expires_at) - Date.now()) / 1000));
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
    
    // Навешиваем безопасное CSP-событие на кнопку вызова
    card.querySelector('.btn-accept').addEventListener('click', function() {
      acceptChallenge(this.getAttribute('data-opp-id'));
    });
    
    container.appendChild(card);
  });
}

window.addEventListener('DOMContentLoaded', initArenaPage);