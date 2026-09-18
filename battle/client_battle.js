// ============================================================================
// ===== ЧАСТЬ 1: ПОДКЛЮЧЕНИЕ СОКЕТОВ И ОБРАБОТКА СЕТЕВЫХ ПАКЕТОВ =====
// ============================================================================

let socket = null;
let currentRoomId = null;
let myUuid = null;

// Локальные массивы для хранения текущего состояния участников на экране
let teamA = []; 
let teamB = [];

// Переменные выбранной тактики текущего раунда
let selectedTargetUuid = null;
let selectedAttackZone = null;
let selectedDefendZones = [];

// Подключаем сокет-соединение прямо при загрузке вкладки боя
function initBattleSocket() {
  console.log("📡 Подключение к боевому серверу...");
  
  // Адрес вашего Node.js сервера
  socket = io('https://onrender.com');

  const localSave = localStorage.getItem('rpg_save');
  let localPlayer = null;
  
  if (localSave) {
    try { localPlayer = JSON.parse(localSave).player; } catch(e) { console.error(e); }
  }

  if (!localPlayer) {
    alert("❌ Профиль персонажа не найден! Вернитесь в город.");
    window.location.href = '../index.html';
    return;
  }

  // Ловим параметры запуска боя из URL-строки браузера
  const urlParams = new URLSearchParams(window.location.search);
  const monsterKey = urlParams.get('monster') || 'wild_wolf';
  const count = urlParams.get('count') || 1;

  socket.on('connect', () => {
    console.log("✅ Соединение с бэкендом установлено!");
    // Отправляем запрос на генерацию массовой PvE комнаты
    socket.emit('search_pve_match', {
      playerData: localPlayer,
      monsterKey: monsterKey,
      count: Number(count)
    });
  });

  setupSocketListeners();
}

function setupSocketListeners() {
  if (!socket) return;

  // Пакет инициализации боя (сервер прислал списки участников)
  socket.on('battle_init_data', (data) => {
    currentRoomId = data.roomId;
    myUuid = data.myUuid;
    teamA = data.teamA;
    teamB = data.teamB;

    // Убираем загрузочную шторку с экрана
    const loader = document.getElementById('battle-loading-overlay');
    if (loader) {
      loader.style.opacity = "0";
      setTimeout(() => loader.remove(), 300);
    }

    document.getElementById('battle-round-indicator').textContent = `⚔️ Раунд ${data.turnCount}`;
    checkPotionAvailability();
    renderFighters();
    
    document.getElementById('battle-log-viewport').innerHTML = 
      `<div class="log-system">⚔️ Бой начался! Выберите тактику и цель для удара.</div>`;
  });

  // Пакет результатов раунда (сервер просчитал ходы)
  socket.on('round_result', (data) => {
    teamA = data.teamA;
    teamB = data.teamB;

    document.getElementById('battle-round-indicator').textContent = `⚔️ Раунд ${data.turnCount + 1}`;
    
    // Сбрасываем выбранные флаги тактики для нового раунда
    selectedAttackZone = null;
    selectedDefendZones = [];
    selectedTargetUuid = null;
    
    resetTacticalButtons();
    renderFighters();

    const logBox = document.getElementById('battle-log-viewport');
    const divBreak = document.createElement('div');
    divBreak.className = 'log-round-break';
    divBreak.textContent = `--- Итоги раунда ${data.turnCount} ---`;
    logBox.appendChild(divBreak);

    data.logs.forEach(msg => {
      const d = document.createElement('div');
      d.innerHTML = msg;
      if (msg.includes('нанес урона') || msg.includes('повержен')) d.className = 'log-damage';
      if (msg.includes('успешно заблокировал') || msg.includes('🛡️')) d.className = 'log-miss';
      if (msg.includes('🎉') || msg.includes('🏁')) d.className = 'log-system';
      logBox.appendChild(d);
    });

    logBox.scrollTop = logBox.scrollHeight;

    const strikeBtn = document.getElementById('strike-action-btn');
    if (strikeBtn && !data.isOver) {
      strikeBtn.textContent = 'АТАКОВАТЬ';
      strikeBtn.disabled = true;
    }

    if (data.isOver && strikeBtn) {
      strikeBtn.textContent = 'ВЕРНУТЬСЯ В ГОРОД';
      strikeBtn.disabled = false;
      strikeBtn.style.background = 'var(--success)';
      strikeBtn.onclick = () => { window.location.href = '../index.html'; };
      document.getElementById('battle-potion-btn')?.remove();
    }
  });

  socket.on('battle_effect_potion', (data) => {
    const fighter = teamA.find(p => p.uuid === data.uuid);
    if (fighter) fighter.currentHp = data.currentHp;
    renderFighters();

    const logBox = document.getElementById('battle-log-viewport');
    const d = document.createElement('div');
    d.className = 'log-hit';
    d.innerHTML = data.logMsg;
    logBox.appendChild(d);
    logBox.scrollTop = logBox.scrollHeight;
  });

  socket.on('error', (msg) => { alert(`❌ Ошибка боя: ${msg}`); });
}
// ============================================================================
// ===== ЧАСТЬ 2: ОТРИСОВКА БОЙЦОВ, ТАРГЕТИНГ И ВЫБОР ТАКТИКИ =====
// ============================================================================

function renderFighters() {
  const enemiesGrid = document.getElementById('enemies-grid');
  const alliesGrid = document.getElementById('allies-grid');
  if (!enemiesGrid || !alliesGrid) return;

  enemiesGrid.innerHTML = '';
  alliesGrid.innerHTML = '';

  // 1. Рисуем Врагов (Team B)
  teamB.forEach(enemy => {
    const card = document.createElement('div');
    const isDead = enemy.currentHp <= 0;
    card.className = `fighter-card ${isDead ? 'dead' : ''} ${selectedTargetUuid === enemy.uuid ? 'target-selected' : ''}`;
    
    card.innerHTML = `
      <div class="fighter-info"><span>${enemy.icon || '👹'}</span> ${enemy.name}</div>
      <div class="fighter-lvl">Lv. ${enemy.level || 1}</div>
      <div class="fighter-hp-bar">
        <div class="fighter-hp-fill" style="width: ${(enemy.currentHp / enemy.maxHp) * 100}%"></div>
      </div>
      <div class="fighter-hp-text">${enemy.currentHp} / ${enemy.maxHp}</div>
    `;

    if (!isDead) {
      card.addEventListener('click', () => {
        selectedTargetUuid = enemy.uuid;
        renderFighters(); // Перерисовываем ради подсветки красного контура
        checkStrikeButtonState();
      });
    }
    enemiesGrid.appendChild(card);
  });

  // 2. Рисуем Союзников / Вас (Team A)
  teamA.forEach(ally => {
    const card = document.createElement('div');
    const isDead = ally.currentHp <= 0;
    card.className = `fighter-card ${isDead ? 'dead' : ''}`;
    
    card.innerHTML = `
      <div class="fighter-info"><span>${ally.icon || '👤'}</span> ${ally.name}</div>
      <div class="fighter-lvl">Lv. ${ally.level || 1}</div>
      <div class="fighter-hp-bar">
        <div class="fighter-hp-fill" style="width: ${(ally.currentHp / ally.maxHp) * 100}%"></div>
      </div>
      <div class="fighter-hp-text">${ally.currentHp} / ${ally.maxHp}</div>
    `;
    alliesGrid.appendChild(card);
  });
}

function initTacticalClickListeners() {
  // Клики по кнопкам зоны Атаки
  document.querySelectorAll('.btn-atk').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.btn-atk').forEach(b => b.classList.remove('attack-selected'));
      selectedAttackZone = this.getAttribute('data-zone');
      this.classList.add('attack-selected');
      checkStrikeButtonState();
    });
  });

  // Клики по кнопкам зоны Защиты (Выбор ровно 2 зон)
  document.querySelectorAll('.btn-def').forEach(btn => {
    btn.addEventListener('click', function() {
      const zone = this.getAttribute('data-zone');

      if (selectedDefendZones.includes(zone)) {
        selectedDefendZones = selectedDefendZones.filter(z => z !== zone);
        this.classList.remove('defend-selected');
      } else {
        if (selectedDefendZones.length >= 2) {
          const removedZone = selectedDefendZones.shift();
          const oldBtn = document.querySelector(`.btn-def[data-zone="${removedZone}"]`);
          if (oldBtn) oldBtn.classList.remove('defend-selected');
        }
        selectedDefendZones.push(zone);
        this.classList.add('defend-selected');
      }
      checkStrikeButtonState();
    });
  });

  // Отправка готового хода на сервер
  const strikeActionBtn = document.getElementById('strike-action-btn');
  if (strikeActionBtn) {
    strikeActionBtn.addEventListener('click', function() {
      if (!selectedAttackZone || selectedDefendZones.length !== 2 || !selectedTargetUuid) return;

      this.disabled = true;
      this.textContent = 'Ожидание расчета сервером...';

      socket.emit('submit_turn', {
        roomId: currentRoomId,
        targetUuid: selectedTargetUuid,
        attack: selectedAttackZone,
        defends: selectedDefendZones
      });
    });
  }
}

function checkStrikeButtonState() {
  const strikeBtn = document.getElementById('strike-action-btn');
  if (!strikeBtn) return;

  if (selectedAttackZone && selectedDefendZones.length === 2 && selectedTargetUuid) {
    strikeBtn.disabled = false;
  } else {
    strikeBtn.disabled = true;
  }
}

function resetTacticalButtons() {
  document.querySelectorAll('.btn-atk').forEach(b => b.classList.remove('attack-selected'));
  document.querySelectorAll('.btn-def').forEach(b => b.classList.remove('defend-selected'));
}

function checkPotionAvailability() {
  const localSave = localStorage.getItem('rpg_save');
  if (!localSave) return;
  
  try {
    const player = JSON.parse(localSave).player;
    const potionId = player.equipped?.potion;
    const potionBtn = document.getElementById('battle-potion-btn');
    
    if (potionId && potionBtn) {
      const pData = window.getItemData ? window.getItemData(potionId) : null;
      if (pData) {
        potionBtn.style.display = 'block';
        potionBtn.innerHTML = `${pData.icon} Выпить: ${pData.name} (+${pData.heal} HP)`;
        
        potionBtn.onclick = function() {
          potionBtn.remove();
          socket.emit('instant_use_potion', { roomId: currentRoomId });
        };
      }
    }
  } catch(e) {}
}

window.addEventListener('DOMContentLoaded', () => {
  initBattleSocket();
  initTacticalClickListeners();
});