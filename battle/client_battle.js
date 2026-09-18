// ============================================================================
// ===== ЧАСТЬ 1: ПОДКЛЮЧЕНИЕ СОКЕТОВ И СИНХРОНИЗАЦИЯ СЕТЕВЫХ ДАННЫХ =====
// ============================================================================

let socket = null;
let currentRoomId = null;
let myUuid = null;

// Локальные массивы участников массового боя
let teamA = []; 
let teamB = [];

// Выбранные параметры тактики на текущий раунд
let selectedTargetUuid = null;
let selectedAttackZone = null;
let selectedDefendZones = [];

// Функция безопасного старта сокетов из интернета с ожиданием библиотеки
function initBattleSocket() {
  console.log("📡 Проверяем готовность интернет-библиотеки Socket.io...");

  if (typeof io === 'undefined') {
    setTimeout(initBattleSocket, 50);
    return;
  }

  console.log("✅ Библиотека Socket.io v4.8.3 обнаружена. Подключаемся...");
  socket = io('https://onrender.com');

  const localSave = localStorage.getItem('rpg_save');
  let localPlayer = null;
  
  if (localSave) {
    try { localPlayer = JSON.parse(localSave).player; } catch(e) { console.error(e); }
  }

  if (!localPlayer) {
    alert("❌ Ошибка: Профиль персонажа не найден в кэше! Вернитесь в город.");
    window.location.href = '../index.html';
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const monsterKey = urlParams.get('monster') || 'wild_wolf';
  const count = urlParams.get('count') || 1;

  socket.on('connect', () => {
    console.log("⚔️ Успешный коннект! Запрашиваем массовый поединок у сервера...");
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

  // Пакет инициализации боя (первый заход на арену)
  socket.on('battle_init_data', (data) => {
    currentRoomId = data.roomId;
    myUuid = data.myUuid;
    teamA = data.teamA;
    teamB = data.teamB;

    // Автоматически выбираем целью первого живого врага
    const firstAliveEnemy = teamB.find(e => teamB.currentHp !== 0); // Исправление: проверка ХП
    if (firstAliveEnemy) selectedTargetUuid = firstAliveEnemy.uuid;

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
      `<div class="log-system">⚔️ Бой начался! Выберите тактику раунда и цель на нижней правой панели.</div>`;
  });

  // Пакет результатов раунда от бэкенда Node.js
  socket.on('round_result', (data) => {
    teamA = data.teamA;
    teamB = data.teamB;

    document.getElementById('battle-round-indicator').textContent = `⚔️ Раунд ${data.turnCount + 1}`;
    
    // Сбрасываем флаги тактики
    selectedAttackZone = null;
    selectedDefendZones = [];
    
    // Если текущая выбранная цель погибла в этом раунде, авто-переключаем фокус на любого выжившего врага
    const currentTarget = teamB.find(e => e.uuid === selectedTargetUuid);
    if (!currentTarget || currentTarget.currentHp <= 0) {
      const nextAlive = teamB.find(e => e.currentHp > 0);
      selectedTargetUuid = nextAlive ? nextAlive.uuid : null;
    }

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
      if (msg.includes('заблокировал удар') || msg.includes('🛡️')) d.className = 'log-miss';
      if (msg.includes('🎉') || msg.includes('🏁')) d.className = 'log-system';
      logBox.appendChild(d);
    });

    logBox.scrollTop = logBox.scrollHeight;

    const strikeBtn = document.getElementById('strike-action-btn');
    if (strikeBtn && !data.isOver) {
      strikeBtn.textContent = 'Ударить';
      strikeBtn.disabled = true;
    }

    if (data.isOver && strikeBtn) {
      strikeBtn.textContent = 'В ГОРОД';
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
// ===== ЧАСТЬ 2: ДУЭЛЬНЫЙ РЕНДЕРИНГ, ТАРГЕТИНГ И ИНИЦИАЛИЗАЦИЯ КЛИКОВ =====
// ============================================================================

/**
 * 📊 УМНАЯ ОТРИСОВКА ДУЭЛЬНОГО ИНТЕРФЕЙСА (БОЛЬШИЕ КАРТОЧКИ + МАССОВКА)
 */
function renderFighters() {
  // 1. Отрендерим вашего главного героя (Левая большая карточка)
  const myFighter = teamA.find(f => f.uuid === myUuid);
  if (myFighter) {
    document.getElementById('hero-lvl-text').textContent = `Lv. ${myFighter.level || 1}`;
    document.getElementById('hero-name-text').textContent = myFighter.name;
    
    const heroFill = document.getElementById('hero-hp-fill');
    if (heroFill) heroFill.style.width = `${(myFighter.currentHp / myFighter.maxHp) * 100}%`;
    document.getElementById('hero-hp-text').textContent = `${myFighter.currentHp} / ${myFighter.maxHp}`;
    
    // Если герой погиб, тушим карточку дуэли
    const heroCard = document.getElementById('main-hero-card');
    if (heroCard) {
      if (myFighter.currentHp <= 0) heroCard.classList.add('dead');
      else heroCard.classList.remove('dead');
    }
  }

  // 2. Отрендерим выбранную цель (Правая большая карточка)
  // Если цель не была выбрана вручную, автоматически фокусируемся на первом выжившем противнике
  if (!selectedTargetUuid && teamB.length > 0) {
    const firstAlive = teamB.find(e => e.currentHp > 0);
    if (firstAlive) selectedTargetUuid = firstAlive.uuid;
  }

  const targetFighter = teamB.find(e => e.uuid === selectedTargetUuid);
  const targetCard = document.getElementById('main-target-card');

  if (targetFighter && targetFighter.currentHp > 0) {
    if (targetCard) targetCard.classList.remove('dead');
    document.getElementById('target-lvl-text').textContent = `Lv. ${targetFighter.level || 1}`;
    document.getElementById('target-avatar-text').textContent = targetFighter.icon || '👹';
    document.getElementById('target-name-text').textContent = targetFighter.name;
    
    const targetFill = document.getElementById('target-hp-fill');
    if (targetFill) targetFill.style.width = `${(targetFighter.currentHp / targetFighter.maxHp) * 100}%`;
    document.getElementById('target-hp-text').textContent = `${targetFighter.currentHp} / ${targetFighter.maxHp}`;
  } else {
    // Если живых целей нет или все мертвы, сбрасываем правую карточку в пустую заглушку
    if (targetCard) targetCard.classList.add('dead');
    document.getElementById('target-lvl-text').textContent = `Lv. --`;
    document.getElementById('target-avatar-text').textContent = '💀';
    document.getElementById('target-name-text').textContent = 'Нет живых целей';
    const targetFill = document.getElementById('target-hp-fill');
    if (targetFill) targetFill.style.width = `0%`;
    document.getElementById('target-hp-text').textContent = `0 / 0`;
  }

  // 3. ОТРИСОВКА КОМПАКТНЫХ СПИСКОВ МАССОВКИ (РЕЗЕРВНЫЕ ЗОНЫ СНИЗУ)
  const alliesListEl = document.getElementById('allies-reserve-list');
  const enemiesListEl = document.getElementById('enemies-reserve-list');

  if (!alliesListEl || !enemiesListEl) return;
  alliesListEl.innerHTML = '';
  enemiesListEl.innerHTML = '';

  // Сборка списка вашей команды (Team A)
  teamA.forEach(ally => {
    const card = document.createElement('div');
    const isDead = ally.currentHp <= 0;
    card.className = `mini-fighter-card ${isDead ? 'dead' : ''}`;
    
    card.innerHTML = `
      <div class="mini-fighter-info"><span>${ally.icon || '👤'}</span> ${ally.name}</div>
      <span style="font-size: 9px; font-family: monospace; color: var(--success); font-weight: bold;">❤️ ${ally.currentHp}</span>
    `;
    alliesListEl.appendChild(card);
  });

  // Сборка списка противников (Team B)
  teamB.forEach(enemy => {
    const card = document.createElement('div');
    const isDead = enemy.currentHp <= 0;
    const isFocused = selectedTargetUuid === enemy.uuid;
    
    card.className = `mini-fighter-card ${isDead ? 'dead' : ''} ${isFocused ? 'active-target' : ''}`;
    
    card.innerHTML = `
      <div class="mini-fighter-info"><span>${enemy.icon || '👹'}</span> ${enemy.name}</div>
      <span style="font-size: 9px; font-family: monospace; color: ${isFocused ? 'var(--danger)' : 'var(--hint)'}; font-weight: bold;">HP: ${enemy.currentHp}</span>
    `;

    // Клик по любому противнику в списке мгновенно выводит его на главную карточку дуэли!
    if (!isDead) {
      card.onclick = function() {
        console.log(`🎯 Смена фокуса дуэли на: ${enemy.name}`);
        selectedTargetUuid = enemy.uuid;
        renderFighters(); // Полная перерисовка карточек
        checkStrikeButtonState();
      };
    }
    enemiesListEl.appendChild(card);
  });
}

/**
 * 🛠 ИНИЦИАЛИЗАЦИЯ СЛУШАТЕЛЕЙ КЛИКОВ ЦЕНТРАЛЬНОГО ПУЛЬТА ТАКТИКИ
 */
function initTacticalClickListeners() {
  // Клики по 5 зонам удара (Глв, Грд, Трс, Пяс, Нг)
  document.querySelectorAll('.btn-atk').forEach(btn => {
    btn.onclick = function() {
      document.querySelectorAll('.btn-atk').forEach(b => b.classList.remove('attack-selected'));
      selectedAttackZone = this.getAttribute('data-zone');
      this.classList.add('attack-selected');
      checkStrikeButtonState();
    };
  });

  // Клики по 5 зонам блока (Выбор ровно 2-х зон)
  document.querySelectorAll('.btn-def').forEach(btn => {
    btn.onclick = function() {
      const zone = this.getAttribute('data-zone');

      if (selectedDefendZones.includes(zone)) {
        selectedDefendZones = selectedDefendZones.filter(z => z !== zone);
        this.classList.remove('defend-selected');
      } else {
        if (selectedDefendZones.length >= 2) {
          const removedZone = selectedDefendZones.shift();
          document.querySelector(`.btn-def[data-zone="${removedZone}"]`)?.classList.remove('defend-selected');
        }
        selectedDefendZones.push(zone);
        this.classList.add('defend-selected');
      }
      checkStrikeButtonState();
    };
  });

  // Жирная центральная кнопка «Ударить»
  const strikeActionBtn = document.getElementById('strike-action-btn');
  if (strikeActionBtn) {
    strikeActionBtn.onclick = function() {
      if (!selectedAttackZone || selectedDefendZones.length !== 2 || !selectedTargetUuid) return;

      this.disabled = true;
      this.textContent = 'Расчет...';

      // Отправляем пакет хода на Node.js сервер
      socket.emit('submit_turn', {
        roomId: currentRoomId,
        targetUuid: selectedTargetUuid,
        attack: selectedAttackZone,
        defends: selectedDefendZones
      });
    };
  }
}

function checkStrikeButtonState() {
  const strikeBtn = document.getElementById('strike-action-btn');
  if (strikeBtn) {
    // Включаем кнопку удара, только если выбрана цель, 1 зона атаки и 2 зоны защиты
    strikeBtn.disabled = !(selectedAttackZone && selectedDefendZones.length === 2 && selectedTargetUuid);
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

// Точка входа: запускаем сборку логики после полной прогрузки DOM дерева
window.addEventListener('DOMContentLoaded', () => {
  initBattleSocket();
  initTacticalClickListeners();
});