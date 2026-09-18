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
    checkPotionAvailability();
    // Сбрасываем флаги тактики для нового раунда
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

    // Выводим логи раунда в окно
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
    
    // Если бой ЕЩЕ ПРОДОЛЖАЕТСЯ
    if (!data.isOver) {
      if (strikeBtn) {
        strikeBtn.textContent = 'Ударить';
        strikeBtn.disabled = true; // Будет активна, когда игрок выберет новые зоны
      }
    } 
    // 🔥 Если бой ОКОНЧЕН (Победа или Поражение)
    else {
      if (strikeBtn) {
        strikeBtn.textContent = 'ВЕРНУТЬСЯ В ГОРОД';
        strikeBtn.disabled = false;
        strikeBtn.style.background = 'var(--success)';
        
        // Намертво стираем старую логику отправки ходов на сервер, чтобы кнопка не спамила бэкенд
        strikeBtn.onclick = null; 
        
        // Навешиваем безопасный и чистый выход из сессии
        strikeBtn.onclick = function() {
          console.log("🏃‍♂️ Покидаем поле боя. Отключаем сокеты и возвращаемся в город...");
          
          // Принудительно закрываем сетевое соединение боевой вкладки
          if (socket) {
            socket.disconnect();
          }
          
          // Жестко перезагружаем мирный экран города, очищая кэш сокетов в Telegram
          window.location.replace('../index.html');
        };
      }
      
      // Сносим кнопку моментального питья зелий, чтобы её нельзя было нажать после драки
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
  const strikeBtn = document.getElementById('strike-action-btn');
  const isBattleOver = strikeBtn && strikeBtn.textContent.includes('ГОРОД');

  // Относительные пути к стандартным картинкам-заглушкам в корне проекта
  const DEFAULT_HERO_IMG = "../assets/avatars/hero5.jpg";
  const DEFAULT_MONSTER_IMG = "../assets/monsters/monster1.jpg";

  // 1. ОТРИСОВКА ВАШЕГО ГЕРОЯ (ЛЕВАЯ КАРТОЧКА ДУЭЛИ)
  const myFighter = teamA.find(f => f.uuid === myUuid);
  if (myFighter) {
    document.getElementById('hero-lvl-text').textContent = `Lv. ${myFighter.level || 1}`;
    document.getElementById('hero-name-text').textContent = myFighter.name;
    
   const heroAvatarImg = document.getElementById('hero-avatar-img');
    if (heroAvatarImg) {
      const av = myFighter.avatar;
      let targetSrc = DEFAULT_HERO_IMG;
      
      if (av && (av.includes('.') || av.includes('/'))) {
        targetSrc = av;
      }
      
      // 🔥 ФИКС МОРГАНИЯ: Перезаписываем src ТОЛЬКО если картинка РЕАЛЬНО изменилась!
      // Метод .endsWith() проверяет хвостик ссылки, игнорируя полный домен github.io
      if (!heroAvatarImg.src.endsWith(targetSrc.replace('..', ''))) {
        heroAvatarImg.src = targetSrc;
      }
      
      heroAvatarImg.onerror = function() {
        console.warn(`⚠️ Аватар героя "${av}" выдал 404. Включаем дефолтную заглушку.`);
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

  // 2. ОТРИСОВКА ВЫБРАННОГО ВРАГА (ПРАВАЯ КАРТОЧКА ДУЭЛИ)
  if (!selectedTargetUuid && teamB.length > 0) {
    const firstAlive = teamB.find(e => e.currentHp > 0);
    if (firstAlive) selectedTargetUuid = firstAlive.uuid;
  }

  const targetFighter = teamB.find(e => e.uuid === selectedTargetUuid);
  const targetCard = document.getElementById('main-target-card');
  const targetAvatarImg = document.getElementById('target-avatar-img');

  if (targetFighter && targetFighter.currentHp > 0) {
    if (targetCard) targetCard.classList.remove('dead');
    document.getElementById('target-lvl-text').textContent = `Lv. ${targetFighter.level || 1}`;
    document.getElementById('target-name-text').textContent = targetFighter.name;
    
 if (targetAvatarImg) {
      const iconVal = targetFighter.icon;
      let targetSrc = DEFAULT_MONSTER_IMG;
      
      if (iconVal && (iconVal.includes('.') || iconVal.includes('/'))) {
        targetSrc = iconVal;
      }

      // 🔥 ФИКС МОРГАНИЯ: Перезаписываем src ТОЛЬКО если монстр РЕАЛЬНО сменился (или это новый бой)!
      if (!targetAvatarImg.src.endsWith(targetSrc.replace('..', ''))) {
        targetAvatarImg.src = targetSrc;
      }

      targetAvatarImg.onerror = function() {
        console.warn(`⚠️ Арт монстра "${iconVal}" выдал 404. Включаем дефолтную заглушку.`);
        this.src = DEFAULT_MONSTER_IMG;
        this.onerror = null;
      };
    }

    const displayTargetHp = Math.max(0, targetFighter.currentHp);
    const targetFill = document.getElementById('target-hp-fill');
    if (targetFill) targetFill.style.width = `${(displayTargetHp / targetFighter.maxHp) * 100}%`;
    document.getElementById('target-hp-text').textContent = `${displayTargetHp} / ${targetFighter.maxHp}`;
  } else {
    if (targetCard) targetCard.classList.add('dead');
    document.getElementById('target-lvl-text').textContent = `Lv. --`;
    document.getElementById('target-name-text').textContent = 'Нет живых целей';
    if (targetAvatarImg) targetAvatarImg.src = DEFAULT_MONSTER_IMG;
    const targetFill = document.getElementById('target-hp-fill');
    if (targetFill) targetFill.style.width = `0%`;
    document.getElementById('target-hp-text').textContent = `0 / 0`;
  }

  // 3. ОТРИСОВКА СПИСКОВ МАССОВКИ (РЕЗЕРВНЫЕ ЗОНЫ СНИЗУ)
  const alliesListEl = document.getElementById('allies-reserve-list');
  const enemiesListEl = document.getElementById('enemies-reserve-list');
  if (!alliesListEl || !enemiesListEl) return;
  alliesListEl.innerHTML = '';
  enemiesListEl.innerHTML = '';

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

  teamB.forEach(enemy => {
    const card = document.createElement('div');
    const isDead = enemy.currentHp <= 0;
    const isFocused = selectedTargetUuid === enemy.uuid;
    card.className = `mini-fighter-card ${isDead ? 'dead' : ''} ${isFocused ? 'active-target' : ''}`;
    card.innerHTML = `
      <div class="mini-fighter-info"><span>${enemy.icon || '👹'}</span> ${enemy.name}</div>
      <span style="font-size: 9px; font-family: monospace; color: ${isFocused ? 'var(--danger)' : 'var(--hint)'}; font-weight: bold;">HP: ${enemy.currentHp}</span>
    `;

    // 🔥 ФИКС: Если бой ОКОНЧЕН, полностью отключаем кликабельность плашек монстров!
    if (!isDead && !isBattleOver) {
      card.onclick = function() {
        console.log(`🎯 Смена фокуса дуэли на: ${enemy.name}`);
        selectedTargetUuid = enemy.uuid;
        renderFighters();
        checkStrikeButtonState();
      };
    }
    enemiesListEl.appendChild(card);
  });
}

function initTacticalClickListeners() {
  // Клики по кнопкам атаки
  document.querySelectorAll('.btn-atk').forEach(btn => {
    btn.onclick = function() {
      // 🔥 ФИКС: Игнорируем клики, если бой окончен
      const strikeBtn = document.getElementById('strike-action-btn');
      if (strikeBtn && strikeBtn.textContent.includes('ГОРОД')) return;

      document.querySelectorAll('.btn-atk').forEach(b => b.classList.remove('attack-selected'));
      selectedAttackZone = this.getAttribute('data-zone');
      this.classList.add('attack-selected');
      checkStrikeButtonState();
    };
  });

  // Клики по кнопкам защиты
  document.querySelectorAll('.btn-def').forEach(btn => {
    btn.onclick = function() {
      // 🔥 ФИКС: Игнорируем клики, если бой окончен
      const strikeBtn = document.getElementById('strike-action-btn');
      if (strikeBtn && strikeBtn.textContent.includes('ГОРОД')) return;

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

  const strikeActionBtn = document.getElementById('strike-action-btn');
  if (strikeActionBtn) {
    strikeActionBtn.onclick = function() {
      // 🔥 ФИКС: Жесткая защита — если на кнопке возврат в город, блокируем сокет-отправку!
      if (this.textContent.includes('ГОРОД')) return;

      if (!selectedAttackZone || selectedDefendZones.length !== 2 || !selectedTargetUuid) return;
      this.disabled = true;
      this.textContent = 'Расчет...';
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
  const potionBtn = document.getElementById('battle-potion-btn');
  if (!potionBtn) return;

  // 🔥 ГЛАВНЫЙ ФИКС: Ищем вашего героя в официальном живом массиве команды от сервера!
  const myFighter = teamA.find(f => f.uuid === myUuid);
  
  // Достаем ID надетого зелья прямо из серверного объекта бойца
  const potionId = myFighter && myFighter.equipped ? myFighter.equipped.potion : null;

  // Если сервер подтвердил, что банка в слоте действительно есть и она не выпита
  if (potionId && potionId !== 'null') {
    // Подтягиваем иконку и имя предмета из общей базы данных config.js
    const pData = window.getItemData ? window.getItemData(potionId) : null;
    
    if (pData) {
      potionBtn.style.display = 'block';
      potionBtn.innerHTML = `${pData.icon || '🧪'} Выпить: ${pData.name} (+${pData.heal || 0} HP)`;
      
      potionBtn.onclick = function() {
        // Мгновенно удаляем кнопку с экрана, чтобы избежать двойных кликов
        potionBtn.style.display = 'none';
        // Шлем команду на бэкенд Node.js
        socket.emit('instant_use_potion', { roomId: currentRoomId });
      };
    } else {
      potionBtn.style.display = 'none';
    }
  } else {
    // 🔥 Если банки на сервере нет — кнопка гарантированно скрывается и никогда не всплывет!
    potionBtn.style.display = 'none';
  }
}

// Точка входа: запускаем сборку логики после полной прогрузки DOM дерева
window.addEventListener('DOMContentLoaded', () => {
  initBattleSocket();
  initTacticalClickListeners();
});