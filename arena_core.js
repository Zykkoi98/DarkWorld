// ============================================================================
// ===== 🏆 КЛИЕНТСКОЕ ЯДРО АРЕНЫ: ИНИЦИАЛИЗАЦИЯ И СЕТЬ (ЧАСТЬ 1) =====
// ============================================================================
const SUPABASE_URL = "https://ylslpgujwgxtsabkzgbd.supabase.co"; 
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsc2xwZ3Vqd2d4dHNhYmt6Z2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMDM3ODksImV4cCI6MjEwNDg3OTc4OX0.GKocc3hnVQVSYaOnm1QhHca54sBn8AsiN8mHo6J0ENY"; 

let sb = null; let socket = null; let localPlayer = null;
let myTimerInterval = null; let globalLobbyInterval = null;

function initArenaPage() {
  console.log("🚀 Запуск лобби Арены через родительский мост...");
  
  const parentWindow = window.parent;
  
  if (parentWindow && parentWindow.supabase) {
    sb = parentWindow.sb || parentWindow.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }

  // Забираем уже подключенный живой сокет из города, чтобы не рвать соединение
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
  
  // Достаем игрока из кэша
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
  
  socket.on('connect', () => { 
    console.log("📡 Сокет Арены подключен к бэкенду."); 
  });
  
  // Перехватчик прямого редиректа от сервера (Срабатывает, когда комната PvP создана бэкендом)
  socket.on('arena_redirect_to_battle', (data) => {
    console.log("⚔️ Сервер прислал команду принудительного PvP-боя! Уходим в battle.html...");
    closeArenaAndStartBattle(data.roomId);
  });
  
  socket.on('arena_lobby_updated', () => { refreshArenaLobby(); });
  socket.on('error', (msg) => { alert(`⚠️ Арена: ${msg}`); });
}

function closeArenaAndStartBattle(roomId) {
  // Выключаем тикающие интервалы лобби, чтобы не грузить устройство
  if (myTimerInterval) clearInterval(myTimerInterval);
  if (globalLobbyInterval) clearInterval(globalLobbyInterval);
  
  console.log(`⚔️ Отправляю postMessage в город для редиректа в комнату: ${roomId}`);
  
  // 🔥 СИНХРОНИЗАЦИЯ: Отправляем точный сигнал родителю index.html с ID созданной комнаты
  window.parent.postMessage({ 
    type: 'START_ARENA_BATTLE', 
    userId: localPlayer.id,
    roomId: roomId 
  }, '*');
}

function setupClickListeners() {
  document.getElementById('create-request-btn')?.addEventListener('click', createMyRequest);
  document.getElementById('cancel-request-btn')?.addEventListener('click', cancelMyRequest);
}

// ============================================================================
// ===== 🧠 ОПЕРАЦИОННЫЙ И ВИЗУАЛЬНЫЙ БЛОК ЛОББИ PvP =====
// ============================================================================
async function createMyRequest() {
  if (!sb || !localPlayer) return;
  if (Number(localPlayer.hp || 0) <= 0) return alert("Вы слишком слабы для боя! Излечитесь в городе.");
  
  const duration = 180000; // 3 минуты
  const expiresAt = new Date(Date.now() + duration).toISOString();
  
  // 1. Записываем заявку в Supabase, чтобы ее увидели на доске объявлений другие игроки
  const { error } = await sb.from('arena_lobby').upsert({
    id: Number(localPlayer.id), 
    name: localPlayer.name, 
    level: Number(localPlayer.level || 1), 
    hp: Number(localPlayer.hp), 
    arena_expires_at: expiresAt
  });
  
  if (error) return alert("Ошибка: " + error.message);
  
  // 2. 🔥 СИНХРОНИЗАЦИЯ С СЕРВЕРОМ: Ставим сокет в официальную очередь бэкенда!
  if (socket) {
    socket.emit('search_match', { 
      playerData: localPlayer,
      currentHp: Number(localPlayer.hp),
      maxHp: Number(localPlayer.level * 10) // Приблизительный расчет
    });
  }
  
  refreshArenaLobby();
}

async function cancelMyRequest() {
  if (!sb || !localPlayer) return;

  const { error } = await sb.from('arena_lobby').delete().eq('id', Number(localPlayer.id));
  if (error) return alert("Ошибка отмены: " + error.message);

  if (myTimerInterval) clearInterval(myTimerInterval);
  
  const sPanel = document.getElementById('my-search-panel');
  const cPanel = document.getElementById('my-create-panel');
  if (sPanel) sPanel.style.display = 'none';
  if (cPanel) cPanel.style.display = 'block';

  refreshArenaLobby();
}

async function acceptChallenge(opponentId, opponentMaxHp) {
  if (!sb || !localPlayer) return;
  if (Number(localPlayer.hp || 0) <= 0) return alert("Вы слишком слабы! Излечитесь в городе.");

  console.log(`🎯 Пытаюсь принять вызов у игрока ID: ${opponentId}`);

  try {
    // 1. Пытаемся удалить чужую заявку. Если удалилось — значит, мы успели первыми!
    const { error } = await sb.from('arena_lobby').delete().eq('id', String(opponentId));
    if (error) return alert("Вызов уже принят другим гладиатором!");

    // 2. 🔥 СИНХРОНИЗАЦИЯ С СЕРВЕРОМ: Сигнализируем бэкенду, что мы тоже заходим в search_match!
    // Сервер мгновенно сопоставит нас с оппонентом, уберет его из очереди и создаст PvP-комнату.
    if (socket) {
      socket.emit('search_match', { 
        playerData: localPlayer,
        currentHp: Number(localPlayer.hp),
        maxHp: Number(localPlayer.level * 10)
      });
    }
  } catch (err) {
    console.error("Ошибка в acceptChallenge:", err.message);
  }
}

async function refreshArenaLobby() {
  if (!sb || !localPlayer) return;
  const nowISO = new Date().toISOString();
  
  const { data: lobbyData, error } = await sb.from('arena_lobby').select('*').gt('arena_expires_at', nowISO);
  if (error) return console.error("Ошибка обновления лобби:", error.message);
  
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

  const opponentsRequests = lobbyData.filter(item => Number(item.id) !== myId);
  const counter = document.getElementById('total-requests-counter');
  if (counter) counter.textContent = `Всего: ${opponentsRequests.length}`;
  
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