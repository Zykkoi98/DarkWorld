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

  console.log("✅ Библиотека Socket.io обнаружена. Подключаемся к Render...");
  socket = io('https://onrender.com', {
    transports: ['websocket', 'polling']
  });

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

  // Читаем абсолютно все параметры из строки адреса браузера
  const urlParams = new URLSearchParams(window.location.search);
  let existingRoomId = urlParams.get('roomId'); 
  
  socket.on('connect', () => {
    console.log("🟢 Сокет успешно подключен к бэкенду. Верификация сессии...");

    if (existingRoomId && existingRoomId !== 'null' && existingRoomId !== 'undefined') {
      console.log(`🔄 [РЕКОННЕКТ] Восстанавливаем бой по URL: ${existingRoomId}`);
      socket.emit('reconnect_to_battle', {
        roomId: existingRoomId,
        userId: String(localPlayer.id)
      });
    } else {
      console.log(`🔍 Проверяем ОЗУ сервера перед созданием нового PvE матча...`);
      socket.emit('check_active_battle_directly', { userId: localPlayer.id }, (response) => {
        
        if (response && response.activeRoomId) {
          console.log(`🔄 [ПЕРЕХВАТ ДУБЛИКАТА] Найдена активная комната ${response.activeRoomId}. Восстанавливаем!`);
          socket.emit('reconnect_to_battle', {
            roomId: response.activeRoomId,
            userId: String(localPlayer.id)
          });
        } else {
          const monsterKey = urlParams.get('monster') || 'wild_wolf';
          const count = urlParams.get('count') || 1;
          console.log(`⚔️ Генерируем новый поединок для ${monsterKey} х${count}...`);
          
          socket.emit('search_pve_match', {
            playerData: localPlayer,
            monsterKey: monsterKey,
            count: Number(count)
          });
        }
      });
    }
  });

  setupSocketListeners();
}

function setupSocketListeners() {
  if (!socket) return;

  // 🟢 1. ПАКЕТ ПЕРВИЧНОЙ ИНИЦИАЛИЗАЦИИ БОЯ (ПЕРВЫЙ ВХОД ИЛИ F5)
  socket.on('battle_init_data', (data) => {
    console.log("🌲 Стартовые данные боя получены от сервера:", data);
    
    currentRoomId = data.roomId;
    myUuid = data.myUuid;
    teamA = data.teamA;
    teamB = data.teamB;

    document.getElementById('battle-round-indicator').textContent = `⚔️ Раунд ${data.turnCount}`;
    
    // Автоматически фокусируемся на первом живом противнике из вражеской команды
    const myFighter = [...teamA, ...teamB].find(f => f.uuid === myUuid);
    if (myFighter) {
      const opposingTeam = teamA.includes(myFighter) ? teamB : teamA;
      const firstAliveEnemy = opposingTeam.find(e => e.currentHp > 0);
      selectedTargetUuid = firstAliveEnemy ? firstAliveEnemy.uuid : null;
    }

    resetTacticalButtons();
    renderFighters();
    checkPotionAvailability();

    // Плавно гасим и убираем стартовую шторку загрузки дуэли
    const overlay = document.getElementById('battle-loading-overlay');
    if (overlay) overlay.style.display = 'none';
  });
   // ⚔️ 2. ПАКЕТ РЕЗУЛЬТАТОВ РАУНДА ОТ БЭКЕНДА
  socket.on('round_result', (data) => {
    console.log("📊 Получены итоги обмена ударами:", data);
    
    teamA = data.teamA;
    teamB = data.teamB;

    document.getElementById('battle-round-indicator').textContent = `⚔️ Раунд ${data.turnCount + 1}`;
    
    // Сбрасываем флаги тактики для нового раунда
    selectedAttackZone = null;
    selectedDefendZones = [];
    
    // Переключаем фокус дуэли на следующего живого врага, если старый погиб
    const myFighter = [...teamA, ...teamB].find(f => f.uuid === myUuid);
    if (myFighter) {
      const opposingTeam = teamA.includes(myFighter) ? teamB : teamA;
      const currentTarget = opposingTeam.find(e => e.uuid === selectedTargetUuid);
      if (!currentTarget || currentTarget.currentHp <= 0) {
        const nextAlive = opposingTeam.find(e => e.currentHp > 0);
        selectedTargetUuid = nextAlive ? nextAlive.uuid : null;
      }
    }

    resetTacticalButtons();
    renderFighters();
    checkPotionAvailability();

    // Выводим логи раунда в текстовое окно снизу
    const logBox = document.getElementById('battle-log-viewport');
    if (logBox) {
      const divBreak = document.createElement('div');
      divBreak.className = 'log-round-break';
      divBreak.innerHTML = `<span style="color:var(--hint)">--- Итоги раунда ${data.turnCount} ---</span>`;
      logBox.appendChild(divBreak);

      data.logs.forEach(msg => {
        const d = document.createElement('div');
        d.innerHTML = msg;
        if (msg.includes('нанес') || msg.includes('повержен') || msg.includes('убил')) d.className = 'log-damage';
        if (msg.includes('заблокировал') || msg.includes('🛡️')) d.className = 'log-miss';
        if (msg.includes('🎉') || msg.includes('🏁') || msg.includes('🛑')) d.className = 'log-system';
        logBox.appendChild(d);
      });

      logBox.scrollTop = logBox.scrollHeight;
    }

    const strikeBtn = document.getElementById('strike-action-btn');
    
    if (!data.isOver) {
      if (strikeBtn) {
        strikeBtn.textContent = 'Атаковать';
        strikeBtn.disabled = true;
      }
    } else {
      if (strikeBtn) {
        strikeBtn.textContent = 'ВЕРНУТЬСЯ В ГОРОД';
        strikeBtn.disabled = false;
        strikeBtn.style.background = '#2ecc71';
        
        strikeBtn.onclick = function() {
          console.log("🏃‍♂️ Покидаем поле боя. Отключаем сокеты...");
          if (socket) socket.disconnect();
          window.location.replace('../index.html');
        };
      }
    }
  });

  // 🧪 3. ПАКЕТ ИСПОЛЬЗОВАНИЯ ЗЕЛИЙ
  socket.on('battle_effect_potion', (data) => {
    // 🔥 ФИКС 3: Ищем бойца во всем пуле участников, чтобы Ян в teamB тоже обновлял ХП
    const fighter = [...teamA, ...teamB].find(p => p.uuid === data.uuid);
    if (fighter) fighter.currentHp = data.currentHp;
    if (data.equipped && fighter) fighter.equipped = data.equipped;
    
    renderFighters();
    checkPotionAvailability();

    const logBox = document.getElementById('battle-log-viewport');
    if (logBox) {
      const d = document.createElement('div');
      d.className = 'log-hit';
      d.innerHTML = data.logMsg;
      logBox.appendChild(d);
      logBox.scrollTop = logBox.scrollHeight;
    }
  });

  socket.on('error', (msg) => { alert(`❌ Ошибка боя: ${msg}`); });
}

// ============================================================================
// ===== ЧАСТЬ 2: ЗЕРКАЛЬНЫЙ РЕНДЕРИНГ И АВТО-ТАРГЕТИНГ =====
// ============================================================================
function renderFighters() {
  const strikeBtn = document.getElementById('strike-action-btn');
  const isBattleOver = strikeBtn && strikeBtn.textContent.includes('ГОРОД');

  const DEFAULT_HERO_IMG = "../assets/avatars/hero5.jpg";
  const DEFAULT_MONSTER_IMG = "../assets/monsters/monster1.jpg";

  const myFighter = [...teamA, ...teamB].find(f => f.uuid === myUuid);
  let opposingTeam = [];

  if (myFighter) {
    opposingTeam = teamA.includes(myFighter) ? teamB : teamA;
  } else {
    // 🔥 ФИКС 2: Резервный поиск без опечатки teamA.id
    const localSave = localStorage.getItem('rpg_save');
    if (localSave) {
      try {
        const localPlayerId = String(JSON.parse(localSave).player.id);
        if (teamA.length > 0 && String(teamA[0].id) === localPlayerId) {
          opposingTeam = teamB;
        } else {
          opposingTeam = teamA;
        }
      } catch(e) {
        opposingTeam = teamB;
      }
    }
  }

  if (opposingTeam && opposingTeam.length > 0) {
    const currentTarget = opposingTeam.find(e => e.uuid === selectedTargetUuid);
    if (!currentTarget || currentTarget.currentHp <= 0) {
      const firstAliveEnemy = opposingTeam.find(e => e.currentHp > 0);
      selectedTargetUuid = firstAliveEnemy ? firstAliveEnemy.uuid : null;
    }
  }

  const targetFighter = opposingTeam.find(e => e.uuid === selectedTargetUuid);

  // Отрисовка левой большой карточки (Вы)
  if (myFighter) {
    document.getElementById('hero-lvl-text').textContent = `Lv. ${myFighter.level || 1}`;
    document.getElementById('hero-name-text').textContent = myFighter.name;
    const heroCardBgImg = document.getElementById('hero-card-bg-img');
    if (heroCardBgImg) {
      const av = myFighter.avatar;
      heroCardBgImg.src = (av && (av.includes('.') || av.includes('/'))) ? av : DEFAULT_HERO_IMG;
    }
    const displayHp = Math.max(0, myFighter.currentHp);
    document.getElementById('hero-hp-fill').style.width = `${(displayHp / myFighter.maxHp) * 100}%`;
    document.getElementById('hero-hp-text').textContent = `${displayHp} / ${myFighter.maxHp}`;
  }

  // Отрисовка правой большой карточки (Ваш соперник)
  const targetCard = document.getElementById('main-target-card');
  if (targetFighter && targetFighter.currentHp > 0) {
    if (targetCard) targetCard.classList.remove('dead');
    document.getElementById('target-lvl-text').textContent = `Lv. ${targetFighter.level || 1}`;
    document.getElementById('target-name-text').textContent = targetFighter.name;
    const targetCardBgImg = document.getElementById('target-card-bg-img');
    if (targetCardBgImg) {
      const iconVal = targetFighter.avatar || targetFighter.icon;
      targetCardBgImg.src = (iconVal && (iconVal.includes('.') || iconVal.includes('/'))) ? iconVal : DEFAULT_MONSTER_IMG;
    }
    const displayTargetHp = Math.max(0, targetFighter.currentHp);
    document.getElementById('target-hp-fill').style.width = `${(displayTargetHp / targetFighter.maxHp) * 100}%`;
    document.getElementById('target-hp-text').textContent = `${displayTargetHp} / ${targetFighter.maxHp}`;
  } else {
    if (targetCard) targetCard.classList.add('dead');
    document.getElementById('target-lvl-text').textContent = `Lv. --`;
    document.getElementById('target-name-text').textContent = 'Нет живых целей';
    document.getElementById('target-hp-fill').style.width = `0%`;
    document.getElementById('target-hp-text').textContent = `0 / 0`;
  }

  // Списки массовки внизу экрана
  const alliesListEl = document.getElementById('allies-reserve-list');
  const enemiesListEl = document.getElementById('enemies-reserve-list');
  if (alliesListEl && enemiesListEl) {
    alliesListEl.innerHTML = '';
    enemiesListEl.innerHTML = '';

    const myTeamList = myFighter && teamA.includes(myFighter) ? teamA : teamB;
    const oppTeamList = myFighter && teamA.includes(myFighter) ? teamB : teamA;

    myTeamList.forEach(ally => {
      const card = document.createElement('div');
      card.className = `mini-fighter-card ${ally.currentHp <= 0 ? 'dead' : ''}`;
      card.innerHTML = `<div>${ally.name}</div><span style="font-size:9px; color:var(--success);">❤️ ${Math.max(0, ally.currentHp)}</span>`;
      alliesListEl.appendChild(card);
    });

    oppTeamList.forEach(enemy => {
      const card = document.createElement('div');
      const isDead = enemy.currentHp <= 0;
      const isFocused = selectedTargetUuid === enemy.uuid;
      card.className = `mini-fighter-card ${isDead ? 'dead' : ''} ${isFocused ? 'active-target' : ''}`;
      card.innerHTML = `<div>${enemy.name}</div><span style="font-size:9px; color:${isFocused ? 'var(--danger)' : 'var(--hint)'};">HP: ${Math.max(0, enemy.currentHp)}</span>`;

      if (!isDead && !isBattleOver) {
        // 🔥 ФИКС 1: Клик точечно переключает HUD и рамки, полностью исключая бесконечную перерисовку!
        card.addEventListener('click', function() {
          selectedTargetUuid = enemy.uuid;
          
          document.querySelectorAll('.mini-fighter-card').forEach(c => c.classList.remove('active-target'));
          card.classList.add('active-target');
          
          const tName = document.getElementById('target-name-text');
          const tLvl = document.getElementById('target-lvl-text');
          const tFill = document.getElementById('target-hp-fill');
          const tText = document.getElementById('target-hp-text');
          const tImg = document.getElementById('target-card-bg-img');
          
          if (tName) tName.textContent = enemy.name;
          if (tLvl) tLvl.textContent = `Lv. ${enemy.level || 1}`;
          if (tFill) tFill.style.width = `${(enemy.currentHp / enemy.maxHp) * 100}%`;
          if (tText) tText.textContent = `${enemy.currentHp} / ${enemy.maxHp}`;
          if (tImg) {
            const iconVal = enemy.avatar || enemy.icon;
            tImg.src = (iconVal && (iconVal.includes('.') || iconVal.includes('/'))) ? iconVal : DEFAULT_MONSTER_IMG;
          }
          
          checkStrikeButtonState();
        });
      }
      enemiesListEl.appendChild(card);
    });
  }

  if (typeof checkStrikeButtonState === 'function') checkStrikeButtonState();
  initTacticalClickListeners();
}
// ============================================================================
// ===== ЧАСТЬ 3: СЛУШАТЕЛИ ТАКТИКИ, КНОПКА СТРАЙКА И СНАДОБЬЯ =====
// ============================================================================

function initTacticalClickListeners() {
  const strikeBtn = document.getElementById('strike-action-btn');
  if (strikeBtn && strikeBtn.textContent.includes('ГОРОД')) return;

  // 1. Оживляем кнопки УДАРА (Атаки)
  document.querySelectorAll('.btn-atk').forEach(btn => {
    // Аппаратно клонируем кнопку, чтобы стереть старые обработчики прошлого раунда
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    
    const zone = newBtn.getAttribute('data-zone');
    
    // Возвращаем подсветку, если зона уже выбрана
    if (selectedAttackZone === zone) {
      newBtn.classList.add('attack-selected');
    }

    newBtn.onclick = function() {
      document.querySelectorAll('.btn-atk').forEach(b => b.classList.remove('attack-selected'));
      selectedAttackZone = zone;
      newBtn.classList.add('attack-selected');
      checkStrikeButtonState();
    };
  });

  // 2. Оживляем кнопки БЛОКА (Защиты)
  document.querySelectorAll('.btn-def').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    
    const zone = newBtn.getAttribute('data-zone');
    
    // Возвращаем подсветку выбранных блоков искателя приключений
    if (selectedDefendZones.includes(zone)) {
      newBtn.classList.add('defend-selected');
    }

    newBtn.onclick = function() {
      if (selectedDefendZones.includes(zone)) {
        selectedDefendZones = selectedDefendZones.filter(z => z !== zone);
        newBtn.classList.remove('defend-selected');
      } else {
        if (selectedDefendZones.length >= 2) {
          const removedZone = selectedDefendZones.shift();
          const oldBtn = document.querySelector(`.btn-def[data-zone="${removedZone}"]`);
          if (oldBtn) oldBtn.classList.remove('defend-selected');
        }
        selectedDefendZones.push(zone);
        newBtn.classList.add('defend-selected');
      }
      checkStrikeButtonState();
    };
  });

  // 3. Оживляем главную кнопку "АТАКОВАТЬ" (Страйк)
  const strikeActionBtn = document.getElementById('strike-action-btn');
  if (strikeActionBtn) {
    const newStrikeBtn = strikeActionBtn.cloneNode(true);
    strikeActionBtn.parentNode.replaceChild(newStrikeBtn, strikeActionBtn);

    newStrikeBtn.onclick = function() {
      if (this.textContent.includes('ГОРОД')) return;
      if (!selectedAttackZone || selectedDefendZones.length !== 2 || !selectedTargetUuid) return;
      
      this.disabled = true;
      this.textContent = 'Расчет...';

      console.log(`📤 Направляем сокету честный строковый UUID реального соперника: ${selectedTargetUuid}`);

      socket.emit('submit_turn', {
        roomId: currentRoomId,
        targetUuid: String(selectedTargetUuid), 
        attack: selectedAttackZone,
        defends: selectedDefendZones
      });
    };
  }
}

function checkStrikeButtonState() {
  const strikeBtn = document.getElementById('strike-action-btn');
  if (!strikeBtn) return;

  if (strikeBtn.textContent.includes('ГОРОД')) {
    strikeBtn.disabled = false;
    return;
  }

  strikeBtn.disabled = !(selectedAttackZone && selectedDefendZones.length === 2 && selectedTargetUuid);
}

function resetTacticalButtons() {
  document.querySelectorAll('.btn-atk').forEach(b => b.classList.remove('attack-selected'));
  document.querySelectorAll('.btn-def').forEach(b => b.classList.remove('defend-selected'));
}

function checkPotionAvailability() {
  const quickPotionBtn = document.getElementById('quick-potion-btn');
  if (!quickPotionBtn) return;

  const myFighter = [...teamA, ...teamB].find(f => f.uuid === myUuid);
  const potionSlot = myFighter && myFighter.equipped ? myFighter.equipped.potion : null;

  if (potionSlot && typeof potionSlot === 'object' && potionSlot.id && potionSlot.count > 0) {
    const pData = window.getItemData ? window.getItemData(potionSlot.id) : null;
    if (pData) {
      quickPotionBtn.disabled = false;
      quickPotionBtn.innerHTML = `${pData.icon} <span style="color:#2ecc71; font-size:11px; font-weight:bold;">x${potionSlot.count}</span>`;
      quickPotionBtn.style.border = "1px solid #2ecc71";
      quickPotionBtn.style.boxShadow = "0 0 8px rgba(46, 204, 113, 0.4)";
      quickPotionBtn.title = `Выпить: ${pData.name} (Осталось: ${potionSlot.count} шт.)`;
      
      quickPotionBtn.onclick = function() {
        this.disabled = true;
        socket.emit('instant_use_potion', { roomId: currentRoomId });
      };
    }
  } else {
    quickPotionBtn.disabled = true;
    quickPotionBtn.innerHTML = '🧪';
    quickPotionBtn.style.border = "1px solid var(--border)";
    quickPotionBtn.style.boxShadow = "none";
  }
}

// ЕДИНСТВЕННАЯ ТОЧКА СТАРТА БОЕВОЙ СТРАНИЦЫ
window.addEventListener('DOMContentLoaded', () => {
  initBattleSocket();
});