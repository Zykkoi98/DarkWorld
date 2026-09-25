// ============================================================================
// ===== ⚔️ КЛИЕНТСКИЙ БОЕВОЙ МОДУЛЬ (CLIENT_BATTLE.JS) — ЧАСТЬ 1 ИЗ 4 =====
// ===== ИНИЦИАЛИЗАЦИЯ СОКЕТ-СОЕДИНЕНИЯ И ПОДКЛЮЧЕНИЕ К БОЕВОЙ СЕССИИ =====
// ============================================================================

let socket = null;
let currentRoomId = null;
let myUuid = null;

// Локальные массивы участников боя для рендеринга
let teamA = []; 
let teamB = [];

// Выбранные игроком тактические параметры раунда
let selectedTargetUuid = null;
let selectedAttackZone = null;
let selectedDefendZones = [];

const ZONE_NAMES = { head: "Голову", breast: "Грудь", torso: "Торс", belt: "Пояс", legs: "Ноги" };

// Безопасный старт сокетов с ожиданием загрузки внешней библиотеки
function initBattleSocket() {
  if (typeof io === 'undefined') {
    setTimeout(initBattleSocket, 50);
    return;
  }

  socket = io('https://darkworld-server.onrender.com', {
    transports: ['websocket', 'polling']
  });

  const localSave = localStorage.getItem('rpg_save');
  let localPlayer = null;
  if (localSave) {
    try { localPlayer = JSON.parse(localSave).player; } catch(e) {}
  }

  if (!localPlayer) {
    alert("❌ Ошибка: Профиль персонажа не найден! Вернитесь в город.");
    window.location.href = '../index.html';
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  let existingRoomId = urlParams.get('roomId'); 
  
  socket.on('connect', () => {
    if (existingRoomId && existingRoomId !== 'null' && existingRoomId !== 'undefined') {
      socket.emit('reconnect_to_battle', {
        roomId: existingRoomId, userId: String(localPlayer.id)
      });
    } else {
      socket.emit('check_active_battle_directly', { userId: localPlayer.id }, (response) => {
        if (response && response.activeRoomId) {
          socket.emit('reconnect_to_battle', {
            roomId: response.activeRoomId, userId: String(localPlayer.id)
          });
        } else {
          const monsterKey = urlParams.get('monster') || 'wild_wolf';
          const count = urlParams.get('count') || 1;
          
          socket.emit('search_pve_match', {
            playerData: localPlayer, monsterKey: monsterKey, count: Number(count)
          });
        }
      });
    }
  });

  setupSocketListeners();
}
// ============================================================================
// ===== ⚔️ КЛИЕНТСКИЙ БОЕВОЙ МОДУЛЬ (CLIENT_BATTLE.JS) — ЧАСТЬ 2 ИЗ 4 =====
// ===== ФУНКЦИЯ СЕТЕВЫХ СЛУШАТЕЛЕЙ И НАЧАЛО ОБРАБОТКИ ИТОГОВ РАУНДА =====
// ============================================================================

function setupSocketListeners() {
  if (!socket) return;

  // 🌲 1. ПАКЕТ ПЕРВИЧНОЙ ИНИЦИАЛИЗАЦИИ БОЯ (ПЕРВЫЙ ВХОД ИЛИ F5)
  socket.on('battle_init_data', (data) => {
    console.log("🌲 Стартовые данные боя получены от сервера:", data);
    currentRoomId = data.roomId;
    myUuid = data.myUuid;
    teamA = data.teamA;
    teamB = data.teamB;

    const roundIndicator = document.getElementById('battle-round-indicator');
    if (roundIndicator) roundIndicator.textContent = `⚔️ Раунд ${data.turnCount}`;
    
    // Автоматический фокус на первом живом противнике
    const myFighter = [...teamA, ...teamB].find(f => f.uuid === myUuid);
    if (myFighter) {
      const opposingTeam = teamA.includes(myFighter) ? teamB : teamA;
      const firstAliveEnemy = opposingTeam.find(e => e.currentHp > 0);
      selectedTargetUuid = firstAliveEnemy ? firstAliveEnemy.uuid : null;

    }

    resetTacticalButtons();
    renderFighters();
    checkPotionAvailability();

    const overlay = document.getElementById('battle-loading-overlay');
    if (overlay) overlay.style.display = 'none';
  });

  // 🧪 2. ПАКЕТ МГНОВЕННОГО ЭФФЕКТА ЗЕЛИЙ В БОЮ
  socket.on('battle_effect_potion', (data) => {
    const fighter = [...teamA, ...teamB].find(p => p.uuid === data.uuid);
    if (fighter) fighter.currentHp = data.currentHp;
    if (data.equipped && fighter) fighter.equipped = data.equipped;
    
    renderFighters();
    checkPotionAvailability();

    const logBox = document.getElementById('battle-log-viewport');
    if (logBox && data.logMsg) {
      const d = document.createElement('div');
      d.innerHTML = data.logMsg;
      logBox.appendChild(d);
      logBox.scrollTop = logBox.scrollHeight;
    }
  });

  // ⚔️ 3. ПАКЕТ РЕЗУЛЬТАТОВ РАУНДА ОТ БЭКЕНДА (ИТОГИ ОБМЕНА УДАРАМИ)
  socket.off('round_result');
  socket.on('round_result', (data) => {
    // [ДОБАВЛЕНО] Закрываем окна характеристик при обсчете раунда
    document.getElementById('player-stats-popover').style.display = 'none';
    document.getElementById('monster-stats-popover').style.display = 'none';
    console.log("📊 Получены итоги обмена ударами:", data);
    teamA = data.teamA;
    teamB = data.teamB;

    const roundIndicator = document.getElementById('battle-round-indicator');
    if (roundIndicator) roundIndicator.textContent = `⚔️ Раунд ${data.turnCount + 1}`;
    
    // Сбрасываем выбранные зоны для следующего раунда
    selectedAttackZone = null;
    selectedDefendZones = [];
    
    // Автоматически переносим прицел на живого врага, если текущий погиб
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
    // ============================================================================
// ===== ⚔️ КЛИЕНТСКИЙ БОЕВОЙ МОДУЛЬ (CLIENT_BATTLE.JS) — ЧАСТЬ 3 ИЗ 4 =====
// ===== ВЫВОД ЛОГОВ БОЯ, КНОПКА ФИНАЛА И НАЧАЛО ОТРИСОВКИ КАРТОЧЕК =====
// ============================================================================

    // Печатаем логи обмена ударами в текстовое поле
    const logBox = document.getElementById('battle-log-viewport');
    if (logBox && data.logs) {
      const divBreak = document.createElement('div');
      divBreak.className = 'log-round-break';
      divBreak.innerHTML = `<span style="color:var(--hint)">--- Итоги раунда ${data.turnCount} ---</span>`;
      logBox.appendChild(divBreak);

      data.logs.forEach(msg => {
        if (!msg) return;
        const strMsg = String(msg);
        const d = document.createElement('div');
        d.innerHTML = strMsg;
        
        if (strMsg.includes('нанес') || strMsg.includes('повержен') || strMsg.includes('убил')) d.className = 'log-damage';
        if (strMsg.includes('заблокировал') || strMsg.includes('🛡️')) d.className = 'log-miss';
        if (strMsg.includes('🎉') || strMsg.includes('🏁') || strMsg.includes('🛑')) d.className = 'log-system';
        logBox.appendChild(d);
      });
      logBox.scrollTop = logBox.scrollHeight;
    }

    // Управляем главной кнопкой в зависимости от статуса поединка
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
         // 🔥 Скрываем кнопку случайного удара, когда бой окончен
        const randBtn = document.getElementById('random-strike-btn');
        if (randBtn) randBtn.style.display = 'none';
        strikeBtn.onclick = function() {
          console.log("🏃‍♂️ Покидаем поле боя. Отключаем сокеты...");
          if (socket) socket.disconnect();
          window.location.replace('../index.html');
        };
      }
    }
  });

   // 🔥 [УЛЬТИМАТИВНЫЙ ФРОНТЕНД-ФИКС ДЛЯ КУЛДАУНОВ ЛЕСА/БАШНИ]
  // Перехватываем серверную ошибку КД и выводим её вместо бесконечной загрузки
  socket.on('error', (message) => {
    console.error("🚨 [СЕРВЕРНАЯ ОШИБКА]:", message);
    
    // Скрываем оверлей загрузки арены, чтобы показать интерфейс и текст ошибки
    const overlay = document.getElementById('battle-loading-overlay');
    if (overlay) overlay.style.display = 'none';

    // Вставляем красивый жирный текст ошибки прямо в поле логов боя
    const logViewport = document.getElementById('battle-log-viewport');
    if (logViewport) {
      logViewport.innerHTML = `<div style="color: #e74c3c; font-weight: bold; text-align: center; margin-top: 40px; font-size: 15px; font-family: sans-serif; line-height: 1.6;">${message}</div>`;
    }

    // Находим главную боевую кнопку действий
    const strikeBtn = document.getElementById('strike-action-btn');
    if (strikeBtn) {
      strikeBtn.disabled = false; // Насильно включаем кнопку
      strikeBtn.textContent = 'ВЕРНУТЬСЯ В ГОРОД';
      strikeBtn.style.background = '#2ecc71'; // Окрашиваем в зеленый цвет города
      strikeBtn.style.boxShadow = '0 4px 12px rgba(46, 204, 113, 0.3)';
      
      // Скрываем оранжевую кнопку случайного удара, чтобы не путать игрока
      const randBtn = document.getElementById('random-strike-btn');
      if (randBtn) randBtn.style.display = 'none';

      // При клике на неё вежливо уводим игрока обратно на площадь города
      strikeBtn.onclick = function() {
        console.log("🏃‍♂️ Покидаем пустую арену КД. Отключаем сокеты...");
        if (socket) socket.disconnect();
        window.location.replace('../index.html');
      };
    }
  });
} // Конец функции setupSocketListeners

// --- 4. ДИНАМИЧЕСКИЙ БЕЗОПАСНЫЙ РЕНДЕРИНГ КАРТОЧЕК ХП И МАССОВКИ ---
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
    const localSave = localStorage.getItem('rpg_save');
    if (localSave) {
      try {
        const localPlayerId = String(JSON.parse(localSave).player.id);
        if (teamA.length > 0 && teamA && String(teamA.id) === localPlayerId) {
          opposingTeam = teamB;
        } else {
          opposingTeam = teamA;
        }
      } catch(e) { opposingTeam = teamB; }
    }
  }

  const targetFighter = opposingTeam.find(e => e.uuid === selectedTargetUuid);

  // Отрисовка левой большой HUD карточки (Вы)
  if (myFighter) {
    const elLvl = document.getElementById('hero-lvl-text');
    const elName = document.getElementById('hero-name-text');
    const elHpFill = document.getElementById('hero-hp-fill');
    const elHpText = document.getElementById('hero-hp-text');
    const heroImg = document.getElementById('hero-card-bg-img');

    if (elLvl) elLvl.textContent = `Lv. ${myFighter.level || 1}`;
     if (elName) {
      elName.textContent = myFighter.name;
      
      // СТИЛИЗАЦИЯ ИМЕНИ ИГРОКА БЕЗ ПОДЧЕРКИВАНИЯ
      elName.style.cursor = 'pointer';
      elName.style.textDecoration = 'none'; // Убрали подчеркивание
      elName.style.background = 'transparent'; // Полностью убрали подложку
      elName.style.border = 'none'; // Убрали рамку
      elName.style.color = '#ffffff'; // Возвращаем родной белый цвет
      elName.style.padding = '0';
      elName.style.transform = 'none';

      // Эффекты при наведении/клике на смартфоне
      elName.onmouseenter = () => { elName.style.background = 'rgba(108, 92, 231, 0.3)'; };
      elName.onmouseleave = () => { elName.style.background = 'rgba(108, 92, 231, 0.15)'; };

      elName.onclick = function() {
        if (typeof window.openPlayerStatsInBattle === 'function') {
          window.openPlayerStatsInBattle();
        }
      };
    }
    if (heroImg) heroImg.src = (myFighter.avatar && myFighter.avatar.includes('.')) ? myFighter.avatar : DEFAULT_HERO_IMG;
    
    const dHp = Math.max(0, myFighter.currentHp);
    if (elHpFill) elHpFill.style.width = `${(dHp / myFighter.maxHp) * 100}%`;
    if (elHpText) elHpText.textContent = `${dHp} / ${myFighter.maxHp}`;
  }
  // ============================================================================
// ===== ⚔️ КЛИЕНТСКИЙ БОЕВОЙ МОДУЛЬ (CLIENT_BATTLE.JS) — ЧАСТЬ 4 ИЗ 4 =====
// ===== РЕНДЕРИНГ МАССОВКИ И СЛУШАТЕЛИ ТАКТИЧЕСКИХ ЗОН УДАРОВ/БЛОКОВ =====
// ============================================================================

  // Отрисовка правой большой HUD карточки (Текущий монстр/цель)
  const targetCard = document.getElementById('main-target-card');
  if (targetFighter && targetFighter.currentHp > 0) {
    if (targetCard) targetCard.classList.remove('dead');
    const elTName = document.getElementById('target-name-text');
    const elTLvl = document.getElementById('target-lvl-text');
    const elTHpFill = document.getElementById('target-hp-fill');
    const elTHpText = document.getElementById('target-hp-text');
    const tImg = document.getElementById('target-card-bg-img');
  if (elTName) {
      elTName.textContent = targetFighter.name;
      
      // ЧИСТЫЙ ВИД БЕЗ ПОДЛОЖКИ И ПОДЧЕРКИВАНИЯ
      elTName.style.cursor = 'pointer';
      elTName.style.textDecoration = 'none'; // Убрали подчеркивание
      elTName.style.background = 'transparent'; // Полностью убрали подложку
      elTName.style.border = 'none'; // Убрали рамку
      elTName.style.color = '#ffffff'; // Возвращаем родной белый цвет
      elTName.style.padding = '0';
      elTName.style.transform = 'none';

      // Эффекты при наведении/клике на смартфоне
      elTName.onmouseenter = () => { elTName.style.background = 'rgba(231, 76, 60, 0.3)'; };
      elTName.onmouseleave = () => { elTName.style.background = 'rgba(231, 76, 60, 0.15)'; };

      elTName.onclick = function() {
        if (typeof window.openEnemyStatsInBattle === 'function') {
          window.openEnemyStatsInBattle();
        }
      };
    }
    if (elTLvl) elTLvl.textContent = `Lv. ${targetFighter.level || 1}`;
    if (elTHpFill) elTHpFill.style.width = `${(targetFighter.currentHp / targetFighter.maxHp) * 100}%`;
    if (elTHpText) elTHpText.textContent = `${targetFighter.currentHp} / ${targetFighter.maxHp}`;
    if (tImg) tImg.src = (targetFighter.avatar && targetFighter.avatar.includes('.')) ? targetFighter.avatar : DEFAULT_MONSTER_IMG;
  } else {
    if (targetCard) targetCard.classList.add('dead');
    const elTName = document.getElementById('target-name-text');
    const elTLvl = document.getElementById('target-lvl-text');
    const elTHpFill = document.getElementById('target-hp-fill');
    const elTHpText = document.getElementById('target-hp-text');

    if (elTName) elTName.textContent = 'Нет живых целей';
    if (elTLvl) elTLvl.textContent = `Lv. --`;
    if (elTHpFill) elTHpFill.style.width = `0%`;
    if (elTHpText) elTHpText.textContent = `0 / 0`;
  }

  // Списки резервов массовки внизу экрана
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
        card.addEventListener('click', function() {
          document.getElementById('monster-stats-popover').style.display = 'none';
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
          if (tImg) tImg.src = (enemy.avatar && enemy.avatar.includes('.')) ? enemy.avatar : DEFAULT_MONSTER_IMG;
          
          checkStrikeButtonState();
        });
      }
      enemiesListEl.appendChild(card);
    });
  }

  checkStrikeButtonState();
  initTacticalClickListeners();
}
// === КЛИЕНТСКИЙ ФИКС ДИНАМИЧЕСКИХ ЗОН БК (CLIENT_BATTLE.JS) ===

function getMyTacticalLimits() {
  // Находим объект вашего бойца на Арене
  const myFighter = [...teamA, ...teamB].find(f => f.uuid === myUuid);
  
  let maxAttacks = 1;
  let maxDefends = 1;

  // Считываем точный уровень игрока из глобального профиля города
  const myRealLevel = (window.player && window.player.level) ? Number(window.player.level) : (myFighter ? Number(myFighter.level || 1) : 1);

  if (myFighter && myFighter.equipped) {
    const mainHand = myFighter.equipped.mainHand;
    const offHand = myFighter.equipped.offHand;

    // 🔥 Проверяем левую руку: если в системном ID есть "shield", "buckler" или "wall" — это щит!
    let isShieldEquipped = false;
    if (offHand) {
      const idLower = String(offHand).toLowerCase();
      isShieldEquipped = idLower.includes('shield') || idLower.includes('buckler') || 
                         idLower.includes('wall') || idLower.includes('scutum') || 
                         idLower.includes('aegis') || idLower.includes('screen');
    }

    // 1. Расчет лимита атак (Дуалы дают 2 удара, щит или пустая рука — 1 удар)
    if (offHand && !isShieldEquipped) {
      maxAttacks = 2; // В левой руке левый нож/клинок (не щит) -> разрешаем дуалы (2 удара)!
    } else {
      maxAttacks = 1; // В левой руке щит или занята двуручником -> 1 тяжелый удар!
    }

    // 2. Расчет лимита блоков (Щит дает 3 блока, новичкам 1 лвл — 2 блока, остальным — 1 блок)
    if (isShieldEquipped) {
      maxDefends = 3; // Танк со щитом легально получает 3 блока!
    } else if (myRealLevel <= 1) {
      maxDefends = 2; 
    }
  } else {
    maxDefends = (myRealLevel <= 1) ? 2 : 1;
  }

  return { maxAttacks, maxDefends };
}

function checkStrikeButtonState() {
  const strikeBtn = document.getElementById('strike-action-btn');
  if (!strikeBtn) return;
  if (strikeBtn.textContent.includes('ГОРОД')) {
    strikeBtn.disabled = false;
    return;
  }

  // 🔥 [ЖЕЛЕЗНАЯ ПОДСТРАХОВКА ФОКУСА ЦЕЛИ]
  if (!selectedTargetUuid) {
    const myFighter = [...teamA, ...teamB].find(f => f.uuid === myUuid);
    if (myFighter) {
      const opposingTeam = teamA.includes(myFighter) ? teamB : teamA;
      const firstAliveEnemy = opposingTeam.find(e => e.currentHp > 0);
      if (firstAliveEnemy) {
        selectedTargetUuid = firstAliveEnemy.uuid;
        console.log("🎯 Фокус цели восстановлен автоматически:", selectedTargetUuid);
      }
    }
  }

  const { maxAttacks, maxDefends } = getMyTacticalLimits();
  
  const hasValidAttack = (maxAttacks === 2) ? (selectedAttackZone && Array.isArray(selectedAttackZone) && selectedAttackZone.length === 2) : !!selectedAttackZone;
  const hasValidDefend = (selectedDefendZones.length === maxDefends);

  // Кнопка активируется, только если все условия (включая цель) верны
  strikeBtn.disabled = !(hasValidAttack && hasValidDefend && selectedTargetUuid);
}

function initTacticalClickListeners() {
  const strikeActionBtn = document.getElementById('strike-action-btn');
  if (strikeActionBtn && strikeActionBtn.textContent.includes('ГОРОД')) return;

  const { maxAttacks, maxDefends } = getMyTacticalLimits();

  // 1. СЛУШАТЕЛИ АТАК
  document.querySelectorAll('.btn-atk').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    const zone = newBtn.getAttribute('data-zone');
    
    if (maxAttacks === 2) {
      if (Array.isArray(selectedAttackZone) && selectedAttackZone.includes(zone)) newBtn.classList.add('attack-selected');
    } else {
      if (selectedAttackZone === zone) newBtn.classList.add('attack-selected');
    }

    newBtn.onclick = function() {
      if (maxAttacks === 2) {
        if (!Array.isArray(selectedAttackZone)) selectedAttackZone = [];
        if (selectedAttackZone.includes(zone)) {
          selectedAttackZone = selectedAttackZone.filter(z => z !== zone);
          newBtn.classList.remove('attack-selected');
        } else {
          if (selectedAttackZone.length >= 2) {
            const removed = selectedAttackZone.shift();
            document.querySelector('.btn-atk[data-zone="' + removed + '"]')?.classList.remove('attack-selected');
          }
          selectedAttackZone.push(zone);
          newBtn.classList.add('attack-selected');
        }
      } else {
        document.querySelectorAll('.btn-atk').forEach(b => b.classList.remove('attack-selected'));
        selectedAttackZone = zone;
        newBtn.classList.add('attack-selected');
      }
      checkStrikeButtonState();
    };
  });

  // 2. СЛУШАТЕЛИ БЛОКОВ
  document.querySelectorAll('.btn-def').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    const zone = newBtn.getAttribute('data-zone');
    
    if (selectedDefendZones.includes(zone)) newBtn.classList.add('defend-selected');

    newBtn.onclick = function() {
      if (selectedDefendZones.includes(zone)) {
        selectedDefendZones = selectedDefendZones.filter(z => z !== zone);
        newBtn.classList.remove('defend-selected');
      } else {
        if (selectedDefendZones.length >= maxDefends) {
          const removedZone = selectedDefendZones.shift();
          document.querySelector('.btn-def[data-zone="' + removedZone + '"]')?.classList.remove('defend-selected');
        }
        selectedDefendZones.push(zone);
        newBtn.classList.add('defend-selected');
      }
      checkStrikeButtonState();
    };
  });

  // ============================================================================
  // 🔥 КНОПКА АВТОМАТИЧЕСКОГО СЛУЧАЙНОГО ХОДА (ЖЕСТКАЯ СИНХРОНИЗАЦИЯ С КЛИКОМ)
  // ============================================================================
  const randomStrikeBtn = document.getElementById('random-strike-btn');
  if (randomStrikeBtn) {
    if (strikeActionBtn && strikeActionBtn.textContent.includes('ГОРОД')) {
      randomStrikeBtn.style.display = 'none';
    } else {
      randomStrikeBtn.style.display = 'block';
      
      randomStrikeBtn.onclick = function() {
        const zones = ["head", "breast", "torso", "belt", "legs"];
        const { maxAttacks, maxDefends } = getMyTacticalLimits(); 

        // 🎯 Исправлен PvE фокус: Насильно восстанавливаем цель, если она пуста
        if (!selectedTargetUuid) {
          const myFighter = [...teamA, ...teamB].find(f => f.uuid === myUuid);
          if (myFighter) {
            const opposingTeam = teamA.includes(myFighter) ? teamB : teamA;
            const firstAliveEnemy = opposingTeam.find(e => e.currentHp > 0);
            if (firstAliveEnemy) selectedTargetUuid = firstAliveEnemy.uuid;
          }
        }

        if (!selectedTargetUuid) return alert("❌ Сначала выберите живую цель!");

        // Насильно очищаем не только классы, но и переменные перед автовыбором!
        document.querySelectorAll('.btn-atk').forEach(b => b.classList.remove('attack-selected'));
        document.querySelectorAll('.btn-def').forEach(b => b.classList.remove('defend-selected'));
        selectedAttackZone = maxAttacks === 2 ? [] : null;
        selectedDefendZones = [];

        // 1. Генерируем атаку
        if (maxAttacks === 2) {
          while (selectedAttackZone.length < 2) {
            const rz = zones[Math.floor(Math.random() * zones.length)];
            if (!selectedAttackZone.includes(rz)) selectedAttackZone.push(rz);
          }
          selectedAttackZone.forEach(z => {
            const btn = document.querySelector('.btn-atk[data-zone="' + z + '"]');
            if (btn) btn.classList.add('attack-selected');
          });
        } else {
          selectedAttackZone = zones[Math.floor(Math.random() * zones.length)];
          const btn = document.querySelector('.btn-atk[data-zone="' + selectedAttackZone + '"]');
          if (btn) btn.classList.add('attack-selected');
        }

        // 2. Генерируем блоки
        while (selectedDefendZones.length < maxDefends) {
          const rz = zones[Math.floor(Math.random() * zones.length)];
          if (!selectedDefendZones.includes(rz)) selectedDefendZones.push(rz);
        }
        selectedDefendZones.forEach(z => {
          const btn = document.querySelector('.btn-def[data-zone="' + z + '"]');
          if (btn) btn.classList.add('defend-selected');
        });

        // 3. Обновляем и ищем АКТУАЛЬНУЮ живую кнопку в DOM в эту милисекунду!
        checkStrikeButtonState();
        const freshStrikeBtn = document.getElementById('strike-action-btn');

        // 4. Эмулируем клик строго по живому узлу в разметке
        if (freshStrikeBtn && !freshStrikeBtn.disabled) {
          console.log("🎲 [АВТО-БОЙ] Пакет улетает на бэкенд...");
          freshStrikeBtn.click(); 
        }
      };
    }
  }

  // 3. ОБРАБОТЧИК КНОПКИ АТАКОВАТЬ (Простая и надежная замена через .onclick)
  if (strikeActionBtn) {
    strikeActionBtn.onclick = function() {
      if (this.textContent.includes('ГОРОД')) {
        if (socket) socket.disconnect();
        window.location.replace('../index.html');
        return;
      }
      
      this.disabled = true;
      this.textContent = 'Расчет...';

      socket.emit('submit_turn', {
        roomId: currentRoomId,
        targetUuid: String(selectedTargetUuid), 
        attack: selectedAttackZone, 
        defends: selectedDefendZones
      });
    };
  }
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

// ТОЧКА ВХОДА НА СТРАНИЦУ
window.addEventListener('browse_battle', () => { console.log('Смена контекста...'); });
window.addEventListener('DOMContentLoaded', () => { initBattleSocket(); });


// 🔥 ОБНОВЛЕННЫЙ ТРИГГЕР: ПОЛУЧЕНИЕ ТОЧНЫХ СТАТОВ ИГРОКА С СЕРВЕРА
window.openPlayerStatsInBattle = function() {
  const pBody = document.getElementById('player-popover-body');
  if (!socket || !currentRoomId || !myUuid || !pBody) return;

  pBody.innerHTML = '<div style="color:var(--hint); padding:10px; text-align:center;">⏳ Запрос данных у сервера...</div>';
  document.getElementById('monster-stats-popover').style.display = 'none';
  document.getElementById('player-stats-popover').style.display = 'flex';

  // Запрашиваем точные данные у бэкенда через сокет-коллбэк
  socket.emit('get_fighter_exact_stats', { roomId: currentRoomId, targetUuid: myUuid }, (response) => {
    if (response && response.success && Array.isArray(response.stats)) {
      pBody.innerHTML = ''; // Сносим лоадер
      response.stats.forEach(s => {
        const row = document.createElement('div');
        row.className = 'profile-row';
        row.innerHTML = `<span>${s.label}</span><span style="color:#fff; font-weight:bold;">${s.value}</span>`;
        pBody.appendChild(row);
      });
    } else {
      pBody.innerHTML = `<div style="color:var(--danger); padding:10px;">❌ ${response.error || 'Ошибка сети'}</div>`;
    }
  });
};

// 🔥 ОБНОВЛЕННЫЙ ТРИГГЕР: ПОЛУЧЕНИЕ ТОЧНЫХ СТАТОВ ВРАГА С СЕРВЕРА
window.openEnemyStatsInBattle = function() {
  const mBody = document.getElementById('monster-popover-body');
  if (!socket || !currentRoomId || !selectedTargetUuid || !mBody) return;

  mBody.innerHTML = '<div style="color:var(--hint); padding:10px; text-align:center;">⏳ Запрос данных у сервера...</div>';
  document.getElementById('player-stats-popover').style.display = 'none';
  document.getElementById('monster-stats-popover').style.display = 'flex';

  // Запрашиваем точные данные цели у бэкенда
  socket.emit('get_fighter_exact_stats', { roomId: currentRoomId, targetUuid: selectedTargetUuid }, (response) => {
    if (response && response.success && Array.isArray(response.stats)) {
      mBody.innerHTML = ''; // Сносим лоадер
      response.stats.forEach(s => {
        const row = document.createElement('div');
        row.className = 'profile-row';
        row.innerHTML = `<span>${s.label}</span><span style="color:#fff; font-weight:bold;">${s.value}</span>`;
        mBody.appendChild(row);
      });
    } else {
      mBody.innerHTML = `<div style="color:var(--danger); padding:10px;">❌ ${response.error || 'Ошибка сети'}</div>`;
    }
  });
};