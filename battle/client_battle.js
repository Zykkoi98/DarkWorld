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
  socket = io('https://darkworld-server.onrender.com', {
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
  
  // Проверяем roomId из ссылки редиректа F5
  let existingRoomId = urlParams.get('roomId'); 
  
  // 🔥 ГЛАВНЫЙ АНТИ-БАГ ХИТРОСТЬ: Если roomId в ссылке пустой, но мы зашли сюда 
  // повторно (через кнопку Леса при живом бое), мы принудительно заставим сервер 
  // сделать проверку по ID игрока прямо внутри коннекта!
  socket.on('connect', () => {
    console.log("🟢 Сокет успешно подключен к бэкенду. Верификация сессии...");

    if (existingRoomId && existingRoomId !== 'null' && existingRoomId !== 'undefined') {
      console.log(`🔄 [РЕКОННЕКТ] Найдена комната в URL. Восстанавливаем бой: ${existingRoomId}`);
      socket.emit('reconnect_to_battle', {
        roomId: existingRoomId,
        userId: String(localPlayer.id)
      });
    } else {
      // 🔥 Если явного roomId в ссылке нет, мы СНАЧАЛА тихо спрашиваем сервер,
      // не висит ли для нашего ID уже запущенная комната в ОЗУ бэкенда!
      console.log(`🔍 Тихо проверяем ОЗУ сервера перед созданием нового PvE матча...`);
      socket.emit('check_active_battle_directly', { userId: localPlayer.id }, (response) => {
        
        // Если сервер ответил, что бой УЖЕ ИДЕТ, мы перенаправляем сокет на восстановление!
        if (response && response.activeRoomId) {
          console.log(`🔄 [ПЕРЕХВАТ ДУБЛИКАТА] Сервер нашел активный бой ${response.activeRoomId}. Восстанавливаем!`);
          socket.emit('reconnect_to_battle', {
            roomId: response.activeRoomId,
            userId: String(localPlayer.id)
          });
        } 
        // И только если сервер подтвердил, что игрок чист и свободен — генерируем новый бой!
        else {
          const monsterKey = urlParams.get('monster') || 'wild_wolf';
          const count = urlParams.get('count') || 1;
          console.log(`⚔️ Игрок свободен. Генерируем новый поединок для ${monsterKey} х${count}...`);
          
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

   // ============================================================================
  // 🟢 1. ПАКЕТ ПЕРВИЧНОЙ ИНИЦИАЛИЗАЦИИ БОЯ (ПЕРВЫЙ ВХОД ИЛИ F5)
  // ============================================================================
  socket.on('battle_init_data', (data) => {
    console.log("🌲 Получены стартовые данные боя от сервера Node.js:", data);
    
    currentRoomId = data.roomId;
    myUuid = data.myUuid;
    teamA = data.teamA;
    teamB = data.teamB;

    document.getElementById('battle-round-indicator').textContent = `⚔️ Раунд ${data.turnCount}`;
    
   const myFighter = [...teamA, ...teamB].find(f => f.uuid === myUuid);
  
  if (myFighter) {
    const opposingTeam = teamA.includes(myFighter) ? teamB : teamA;

    // Если текущая цель не выбрана, или выбранная цель умерла/является союзником
    const currentTarget = opposingTeam.find(e => e.uuid === selectedTargetUuid);
    if (!currentTarget || currentTarget.currentHp <= 0) {
      // Ищем первого живого соперника из ВРАЖЕСКОЙ команды
      const firstAliveEnemy = opposingTeam.find(e => e.currentHp > 0);
      selectedTargetUuid = firstAliveEnemy ? firstAliveEnemy.uuid : null;
    }
  }

    resetTacticalButtons();
    renderFighters();
    
    // 🔥 ФИКС: Проверяем и переносим зелье в маленький слот под аватаркой Яна!
    checkPotionAvailability();

    // Плавно гасим и убираем стартовую шторку загрузки дуэли
    const overlay = document.getElementById('battle-loading-overlay');
    if (overlay) {
      overlay.style.transition = "opacity 0.2s ease";
      overlay.style.opacity = "0";
      setTimeout(() => overlay.style.display = 'none', 200);
    }
  });

 // ============================================================================
  // ⚔️ 2. ПАКЕТ РЕЗУЛЬТАТОВ РАУНДА ОТ БЭКЕНДА
  // ============================================================================
  socket.on('round_result', (data) => {
    console.log("📊 Получены итоги обмена ударами:", data);
    
    teamA = data.teamA;
    teamB = data.teamB;

    document.getElementById('battle-round-indicator').textContent = `⚔️ Раунд ${data.turnCount + 1}`;
    
    // Сбрасываем флаги тактики для нового раунда
    selectedAttackZone = null;
    selectedDefendZones = [];
    
    // Если текущая цель погибла, переключаем фокус дуэли на следующего живого врага
    const currentTarget = teamB.find(e => e.uuid === selectedTargetUuid);
    if (!currentTarget || currentTarget.currentHp <= 0) {
      const nextAlive = teamB.find(e => e.currentHp > 0);
      selectedTargetUuid = nextAlive ? nextAlive.uuid : null;
    }

    resetTacticalButtons();
    renderFighters();
    
    // 🔥 ФИКС: Перепроверяем зелье на случай, если боец только что выпил его в раунде!
    checkPotionAvailability();

    // Выводим логи раунда в текстовое окно снизу
    const logBox = document.getElementById('battle-log-viewport');
    if (logBox) {
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
    }

    const strikeBtn = document.getElementById('strike-action-btn');
    
    // Если поединок ЕЩЕ ПРОДОЛЖАЕТСЯ
    if (!data.isOver) {
      if (strikeBtn) {
        strikeBtn.textContent = 'Атаковать';
        strikeBtn.disabled = true; // Будет активна, когда игрок выберет новую тактику
      }
    } 
    // 🔥 Если БОЙ ОКОНЧЕН официально (Победа или Смерть Яна)
    else {
      if (strikeBtn) {
        strikeBtn.textContent = 'ВЕРНУТЬСЯ В ГОРОД';
        strikeBtn.disabled = false;
        strikeBtn.style.background = 'var(--success)';
        
        // Намертво стираем боевую функцию сокета, чтобы кнопка не спамила бэкенд
        strikeBtn.onclick = null; 
        
        // Навешиваем безопасный и чистый выход из сессии
        strikeBtn.onclick = function() {
          console.log("🏃‍♂️ Покидаем поле боя. Отключаем сокеты боевой вкладки...");
          
          if (socket) {
            socket.disconnect();
          }
          
          // Жестко перезагружаем мирный экран города, очищая кэш в Telegram
          window.location.replace('../index.html');
        };
      }
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

// ============================================================================
// 🖼️ ЗЕРКАЛЬНАЯ ОТРИСОВКА УЧАСТНИКОВ PvP БОЯ (СЕБЯ СЛЕВА, ВРАГА СПРАВА)
// ============================================================================
function renderFighters() {
  // Главный определитель финала: проверяем, переведена ли кнопка в режим выхода в город
  const strikeBtn = document.getElementById('strike-action-btn');
  const isBattleOver = strikeBtn && strikeBtn.textContent.includes('ГОРОД');

  // Относительные пути к стандартным картинкам-заглушкам в корне проекта
  const DEFAULT_HERO_IMG = "../assets/avatars/hero5.jpg";
  const DEFAULT_MONSTER_IMG = "../assets/monsters/monster1.jpg";

  // ============================================================================
  // 🔥 ЖЕСТКИЙ АВТО-ТАРГЕТИНГ ДЛЯ АРЕНЫ И ЛЕСА (АНТИ-БЛОКИРОВКА КНОПОК)
  // ============================================================================
  
  // 1. Ищем НАШЕГО персонажа в общем пуле участников боя (в teamA или teamB)
  const myFighter = [...teamA, ...teamB].find(f => f.uuid === myUuid);
  
  // 2. Изолируем и определяем команду врагов
  let opposingTeam = [];
  if (myFighter) {
    opposingTeam = teamA.includes(myFighter) ? teamB : teamA;
  } else {
    // Резервный фоллбэк: если myUuid еще не успел прогрузиться в ОЗУ смартфона,
    // заглядываем в кэш телефона, чтобы мгновенно разделить участников на "Я / Враг"
    const localSave = localStorage.getItem('rpg_save');
    if (localSave) {
      try {
        const localPlayerId = String(JSON.parse(localSave).player.id);
        // Если мой локальный ID совпадает с Лидером teamA, значит соперники сидят в teamB
        if (teamA.length > 0 && String(teamA[0].id) === localPlayerId) {
          opposingTeam = teamB;
        } else {
          opposingTeam = teamA;
        }
      } catch(e) {
        opposingTeam = teamB; // Экстренный сброс на команду монстров
      }
    }
  }

  // 3. Автоматически захватываем UUID живого врага
  let targetFighter = null;
  if (opposingTeam && opposingTeam.length > 0) {
    const currentTarget = opposingTeam.find(e => e.uuid === selectedTargetUuid);
    
    // Если цель умерла, сбросилась или еще не выбрана — берем первого живого врага
    if (!currentTarget || currentTarget.currentHp <= 0) {
      const firstAliveEnemy = opposingTeam.find(e => e.currentHp > 0);
      selectedTargetUuid = firstAliveEnemy ? firstAliveEnemy.uuid : null;
    }
    
    targetFighter = opposingTeam.find(e => e.uuid === selectedTargetUuid);
  }

  // -------------------------------------------------------------------------
  // 👤 1. ОТРИСОВКА ВАШЕГО ГЕРОЯ (ЛЕВАЯ КАРТОЧКА — ТЕПЕРЬ ВСЕГДА ВЫ!)
  // -------------------------------------------------------------------------
  if (myFighter) {
    document.getElementById('hero-lvl-text').textContent = `Lv. ${myFighter.level || 1}`;
    document.getElementById('hero-name-text').textContent = myFighter.name;
    
    // Синхронизируем большой художественный фон внутри самой карточки героя
    const heroCardBgImg = document.getElementById('hero-card-bg-img');
    if (heroCardBgImg) {
      const av = myFighter.avatar;
      let targetSrc = DEFAULT_HERO_IMG;
      if (av && (av.includes('.') || av.includes('/'))) {
        targetSrc = av;
      }
      
      const cleanTarget = targetSrc.split('/').pop();
      if (!heroCardBgImg.src.includes(cleanTarget)) {
        heroCardBgImg.src = targetSrc;
      }
      
      heroCardBgImg.onerror = function() { 
        this.src = DEFAULT_HERO_IMG; 
        this.onerror = null; 
      };
    }

    const displayHp = Math.max(0, myFighter.currentHp);
    const heroFill = document.getElementById('hero-hp-fill');
    if (heroFill) heroFill.style.width = `${(displayHp / myFighter.maxHp) * 100}%`;
    document.getElementById('hero-hp-text').textContent = `${displayHp} / ${myFighter.maxHp}`;
    
    const heroCard = document.getElementById('main-hero-card');
    if (heroCard) {
      if (displayHp <= 0) heroCard.classList.add('dead');
      else heroCard.classList.remove('dead');
    }
  }

  // -------------------------------------------------------------------------
  // 👹/👤 2. ОТРИСОВКА СОПЕРНИКА (ПРАВАЯ КАРТОЧКА — ТЕПЕРЬ ВСЕГДА ВАШ ВРАГ!)
  // -------------------------------------------------------------------------
  const targetCard = document.getElementById('main-target-card');
  const targetCardBgImg = document.getElementById('target-card-bg-img');

  if (targetFighter && targetFighter.currentHp > 0) {
    if (targetCard) targetCard.classList.remove('dead');
    document.getElementById('target-lvl-text').textContent = `Lv. ${targetFighter.level || 1}`;
    document.getElementById('target-name-text').textContent = targetFighter.name;
    
    if (targetCardBgImg) {
      // Игрок может использовать поле avatar, а бот — поле icon. Считываем оба варианта
      const iconVal = targetFighter.avatar || targetFighter.icon;
      let targetSrc = DEFAULT_MONSTER_IMG;
      if (iconVal && (iconVal.includes('.') || iconVal.includes('/'))) {
        targetSrc = iconVal;
      }

      const cleanTarget = targetSrc.split('/').pop();
      if (!targetCardBgImg.src.includes(cleanTarget)) {
        targetCardBgImg.src = targetSrc;
      }
      
      targetCardBgImg.onerror = function() { 
        this.src = DEFAULT_MONSTER_IMG; 
        this.onerror = null; 
      };
    }

    const displayTargetHp = Math.max(0, targetFighter.currentHp);
    const targetFill = document.getElementById('target-hp-fill');
    if (targetFill) targetFill.style.width = `${(displayTargetHp / targetFighter.maxHp) * 100}%`;
    document.getElementById('target-hp-text').textContent = `${displayTargetHp} / ${targetFighter.maxHp}`;
  } else {
    // Состояние, если выживших целей на арене больше не осталось
    if (targetCard) targetCard.classList.add('dead');
    document.getElementById('target-lvl-text').textContent = `Lv. --`;
    document.getElementById('target-name-text').textContent = 'Нет живых целей';
    if (targetCardBgImg) targetCardBgImg.src = DEFAULT_MONSTER_IMG;
    const targetFill = document.getElementById('target-hp-fill');
    if (targetFill) targetFill.style.width = `0%`;
    document.getElementById('target-hp-text').textContent = `0 / 0`;
  }

  // -------------------------------------------------------------------------
  // 📊 3. ОТРИСОВКА СПИСКОВ МАССОВКИ (РЕЗЕРВНЫЕ ЗОНЫ ЗЕРКАЛЬНО ВНИЗУ)
  // -------------------------------------------------------------------------
  const alliesListEl = document.getElementById('allies-reserve-list');
  const enemiesListEl = document.getElementById('enemies-reserve-list');
  if (!alliesListEl || !enemiesListEl) return;
  alliesListEl.innerHTML = '';
  enemiesListEl.innerHTML = '';

  // Сортируем списки массовки под текущего игрока
  const myTeamList = myFighter && teamA.includes(myFighter) ? teamA : teamB;
  const oppTeamList = myFighter && teamA.includes(myFighter) ? teamB : teamA;

  // Рендерим твой отряд союзников (слева снизу)
  myTeamList.forEach(ally => {
    const card = document.createElement('div');
    const displayAllyHp = Math.max(0, ally.currentHp);
    card.className = `mini-fighter-card ${displayAllyHp <= 0 ? 'dead' : ''}`;
    card.innerHTML = `
      <div class="mini-fighter-info">${ally.name}</div>
      <span style="font-size: 9px; font-family: monospace; color: var(--success); font-weight: bold;">❤️ ${displayAllyHp}</span>
    `;
    alliesListEl.appendChild(card);
  });

  // Рендерим пачку врагов (справа снизу)
  oppTeamList.forEach(enemy => {
    const card = document.createElement('div');
    const displayEnemyHp = Math.max(0, enemy.currentHp);
    const isDead = displayEnemyHp <= 0;
    const isFocused = selectedTargetUuid === enemy.uuid;
    card.className = `mini-fighter-card ${isDead ? 'dead' : ''} ${isFocused ? 'active-target' : ''}`;
    card.innerHTML = `
      <div class="mini-fighter-info">${enemy.name}</div>
      <span style="font-size: 9px; font-family: monospace; color: ${isFocused ? 'var(--danger)' : 'var(--hint)'}; font-weight: bold;">HP: ${displayEnemyHp}</span>
    `;

    if (!isDead && !isBattleOver) {
      card.onclick = function() {
        console.log(`🎯 Смена фокуса дуэли на врага (UUID): ${enemy.uuid}`);
        selectedTargetUuid = enemy.uuid;
        renderFighters();
        if (typeof checkStrikeButtonState === 'function') checkStrikeButtonState();
      };
    }
    enemiesListEl.appendChild(card);
  });

  // 🔥 ПРИНУДИТЕЛЬНЫЙ АНТИ-БЛОК КЛИКА: Проверяем статус кнопок, чтобы убрать disabled
  if (typeof checkStrikeButtonState === 'function') {
    checkStrikeButtonState();
  }
  initTacticalClickListeners();
}

function initTacticalClickListeners() {
  const strikeBtn = document.getElementById('strike-action-btn');
  if (strikeBtn && strikeBtn.textContent.includes('ГОРОД')) return;

  // 1. Оживляем кнопки УДАРА (Атаки)
  document.querySelectorAll('.btn-atk').forEach(btn => {
    // Клонируем кнопку, чтобы гарантированно стереть старые зависшие обработчики раунда
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    
    const zone = newBtn.getAttribute('data-zone');
    
    // Возвращаем подсветку, если зона уже была выбрана
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
    
    // Возвращаем подсветку выбранных блоков
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
          // Ищем старую кнопку на обновленном экране и тушим её
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

  // 🔥 ФИКС: Если кнопка переведена в режим возврата в город, МЫ НИКОГДА ЕЕ НЕ ОТКЛЮЧАЕМ!
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

  const myFighter = teamA.find(f => f.uuid === myUuid);
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
    } else {
      quickPotionBtn.disabled = true;
      quickPotionBtn.innerHTML = '🧪';
    }
  } else {
    quickPotionBtn.disabled = true;
    quickPotionBtn.innerHTML = '🧪';
    quickPotionBtn.style.border = "1px solid var(--border)";
    quickPotionBtn.style.boxShadow = "none";
  }
}

// Точка входа: запускаем сборку логики после полной прогрузки DOM дерева
window.addEventListener('DOMContentLoaded', () => {
  initBattleSocket();
  initTacticalClickListeners();
});