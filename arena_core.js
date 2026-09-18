// ============================================================================
// ===== 🏆 КЛИЕНТСКОЕ ЯДРО АРЕНЫ: ИНИЦИАЛИЗАЦИЯ И СЕТЬ (ЧАСТЬ 1) =====
// ============================================================================
const SUPABASE_URL = "https://ylslpgujwgxtsabkzgbd.supabase.co"; 
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsc2xwZ3Vqd2d4dHNhYmt6Z2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMDM3ODksImV4cCI6MjEwNDg3OTc4OX0.GKocc3hnVQVSYaOnm1QhHca54sBn8AsiN8mHo6J0ENY"; 

let sb = null; let socket = null; let localPlayer = null;
let myTimerInterval = null; let globalLobbyInterval = null;

function initArenaPage() {
  console.log("🚀 Запуск лобби Арены через родительский мост...");
  
  // 🔥 ФИКС: Берем уже скачанные и готовые библиотеки прямо из index.html (window.parent)
  // Это убирает 20 секунд сетевого ожидания и запускает страницу мгновенно!
  const parentWindow = window.parent;
  
  if (parentWindow && parentWindow.supabase) {
  sb = parentWindow.sb || parentWindow.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

  // Забираем уже подключенный живой сокет из города, чтобы не рвать соединение при F5
  if (parentWindow && parentWindow.socket) {
    socket = parentWindow.socket;
    setupSocketListeners();
  } else {
    console.warn("⚠️ Прямое сокет-соединение отсутствует, пробуем локально...");
    if (typeof io === 'function') {
      socket = io('https://darkworld-server.onrender.com');
      setupSocketListeners();
    }
  }
  
  // Достаем игрока
  const localSave = localStorage.getItem('rpg_save');
  if (localSave) {
    try { localPlayer = JSON.parse(localSave).player; } catch(e) { console.error(e); }
  }
  
  if (!localPlayer) {
    alert("❌ Профиль персонажа не найден! Вернитесь в город.");
    location.href = 'index.html'; return;
  }
  
  setupClickListeners();
  refreshArenaLobby();
  globalLobbyInterval = setInterval(refreshArenaLobby, 4000);
}

function setupSocketListeners() {
  if (!socket) return;
  
  // 1. При коннекте сокета внутри Арены мы больше НЕ вызываем check_active_battle!
  // Позволяем главному окну города самому управлять проверкой боев при старте.
  socket.on('connect', () => { 
    console.log("📡 Сокет Арены подключен к бэкенду."); 
  });
  
  // 2. 🔥 ФИКС: Если пришел сигнал, что бой успешно возобновлен (для F5)
  socket.on('reconnect_battle_success', () => { 
    console.log("⚔️ Обнаружен активный бой! Прячем Арену и даем команду городу...");
    closeArenaAndStartBattle();
  });
  
  // 3. 🔥 ФИКС: Если пришел сигнал, что PvP бой только что начался (нажали "В БОЙ")
  socket.on('battle_start', () => { 
    console.log("⚔️ PvP Гладиаторский бой начался! Закрываем лобби...");
    closeArenaAndStartBattle();
  });
  
  // Перехватчик прямого редиректа от сервера
  socket.on('arena_redirect_to_battle', ({ opponentId, challengerId }) => {
    const myId = Number(localPlayer.id);
    if (myId === Number(opponentId) || myId === Number(challengerId)) {
      closeArenaAndStartBattle();
    }
  });
  
  socket.on('arena_lobby_updated', () => { refreshArenaLobby(); });
  socket.on('error', (msg) => { alert(`⚠️ Арена: ${msg}`); });
}

function closeArenaAndStartBattle() {
  // Выключаем тикающие интервалы лобби, чтобы не грузить процессор
  if (myTimerInterval) clearInterval(myTimerInterval);
  if (globalLobbyInterval) clearInterval(globalLobbyInterval);
  
  console.log("⚔️ Бой подтвержден! Отправляю безопасный postMessage в город...");
  
  // 🔥 СТАЛО: Безопасно отправляем текстовый сигнал в главное окно города index.html
  // Он легко проходит сквозь любые блокировки безопасности браузера Telegram
  window.parent.postMessage({ type: 'START_ARENA_BATTLE', userId: localPlayer.id }, '*');
}

function setupClickListeners() {
  document.getElementById('create-request-btn')?.addEventListener('click', createMyRequest);
  document.getElementById('cancel-request-btn')?.addEventListener('click', cancelMyRequest);
}
// ============================================================================
// ===== 🧠 ОПЕРАЦИОННЫЙ И ВИЗУАЛЬНЫЙ БЛОК ЛОББИ (ЧАСТЬ 2) =====
// ============================================================================
async function createMyRequest() {
  if (!sb || !localPlayer) return;
  if (Number(localPlayer.hp || 0) <= 0) return alert("Вы слишком слабы для боя! Излечитесь в городе.");
  
  const duration = 180000; // 3 минуты
  const expiresAt = new Date(Date.now() + duration).toISOString();
  
  const { error } = await sb.from('arena_lobby').upsert({
    id: Number(localPlayer.id), 
    name: localPlayer.name, 
    level: Number(localPlayer.level || 1), 
    hp: Number(localPlayer.hp), 
    arena_expires_at: expiresAt
  });
  
  if (error) return alert("Ошибка: " + error.message);
  if (socket) socket.emit('create_arena_request', { userId: localPlayer.id });
  
  refreshArenaLobby();
}

async function cancelMyRequest() {
  if (!sb || !localPlayer) return;

  // 1. Удаляем строчку нашей заявки из таблицы arena_lobby в Supabase
  const { error } = await sb.from('arena_lobby').delete().eq('id', Number(localPlayer.id));
  if (error) return alert("Ошибка отмены: " + error.message);

  // 2. Отправляем сигнал на сервер, чтобы бэкенд обновил доски объявлений у всех игроков
  if (socket) socket.emit('cancel_arena_request', { userId: localPlayer.id });

  // 3. Железно останавливаем тикающий локальный таймер обратного отсчета
  if (myTimerInterval) clearInterval(myTimerInterval);
  
  // 4. 🔥 ФИКС: Надежно и безопасно возвращаем зеленую кнопку создания вызова
  const sPanel = document.getElementById('my-search-panel');
  const cPanel = document.getElementById('my-create-panel');
  if (sPanel) sPanel.style.display = 'none';
  if (cPanel) cPanel.style.display = 'block';

  // 5. Перерисовываем список, чтобы очистить доску объявлений
  refreshArenaLobby();
}

async function acceptChallenge(opponentId, opponentMaxHp) {
  if (!sb || !localPlayer) return;
  if (Number(localPlayer.hp || 0) <= 0) return alert("Вы слишком слабы! Излечитесь в городе.");

  console.log(`🎯 Клик зафиксирован! Пытаюсь удалить заявку врага ID: ${opponentId}`);

  try {
    // 1. Удаляем чужую заявку из таблицы лобби
    const { error } = await sb.from('arena_lobby').delete().eq('id', String(opponentId));
    if (error) return alert("Вызов уже принят другим игроком!");

    const baseEndurance = Number(localPlayer.stats?.endurance !== undefined ? localPlayer.stats.endurance : 1);
    const myRealMaxHp = baseEndurance * 10; 

    console.log(`📡 Отправляю postMessage в город, чтобы запустить сокет Арены на главной странице...`);

  // Теперь пакет отправляет только ID участников, пушить расчеты ХП сюда больше не нужно!
  window.parent.postMessage({ 
    type: 'EXECUTE_ARENA_CHALLENGE', 
    myId: String(localPlayer.id), 
    opponentId: String(opponentId)
  }, '*');
    } catch (err) {
      console.error("Ошибка в acceptChallenge:", err.message);
    }
  }

async function refreshArenaLobby() {
  if (!sb || !localPlayer) return;
  const nowISO = new Date().toISOString();
  
  // Скачиваем все заявки из таблицы arena_lobby, которые еще не сгорели
  const { data: lobbyData, error } = await sb.from('arena_lobby').select('*').gt('arena_expires_at', nowISO);
  if (error) return console.error("Ошибка обновления лобби:", error.message);
  
  const container = document.getElementById('lobby-list-viewport'); 
  if (!container) return;

  const myId = Number(localPlayer.id);
  const myActiveRequest = lobbyData.find(item => Number(item.id) === myId);

  const sPanel = document.getElementById('my-search-panel');
  const cPanel = document.getElementById('my-create-panel');

  // 🔥 ИСПРАВЛЕННЫЙ БЛОК: Надежное переключение панелей БЕЗ .style.style
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

  // Фильтруем список для вывода чужих заявок
  const opponentsRequests = lobbyData.filter(item => Number(item.id) !== myId);
  const counter = document.getElementById('total-requests-counter');
  if (counter) counter.textContent = `Всего: ${opponentsRequests.length}`;
  
  // Очищаем старую сетку доски объявлений
  container.innerHTML = '';

  if (opponentsRequests.length === 0) {
    const placeholder = document.createElement('div'); placeholder.className = 'empty-msg';
    placeholder.textContent = '🏰 На Арене тишина... Будь первым, брось вызов!'; container.appendChild(placeholder); return;
  }

  opponentsRequests.forEach(opp => {
    const oppMaxHp = Number(opp.level * 30 + 70);
    const timeLeft = Math.max(0, Math.floor((new Date(opp.arena_expires_at) - Date.now()) / 1000));
    const mins = Math.floor(timeLeft / 60); const secs = timeLeft % 60;
    
    const card = document.createElement('div'); card.className = 'user-card';
    
    // 🔥 ФИКС: Зашиваем параметры прямо в инлайн onclick! 
    // Экранируем кавычки, чтобы длинный ID передавался как чистая строка/число безопасно.
    card.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 2px;">
        <div style="font-weight: bold; font-size: 15px; color: #ffffff;">${opp.name} <span style="color: #f1c40f; font-size: 12px; font-weight: normal; margin-left: 4px;">Lv. ${opp.level}</span></div>
        <div style="font-size: 12px; color: var(--hint);">❤️ ${opp.hp} ед.</div>
      </div>
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-family: monospace; font-size: 14px; color: #ffc048; font-weight: bold;">⏱️ 0${mins}:${secs < 10 ? '0' + secs : secs}</span>
        <button class="action-btn btn-accept" onclick="acceptChallenge('${opp.id}', ${oppMaxHp})">В БОЙ</button>
      </div>
    `;
    container.appendChild(card);
  });
}

window.addEventListener('DOMContentLoaded', initArenaPage);