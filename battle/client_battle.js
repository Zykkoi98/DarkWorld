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
        
        strikeBtn.onclick = function() {
          console.log("🏃‍♂️ Покидаем поле боя. Отключаем сокеты...");
          if (socket) socket.disconnect();
          window.location.replace('../index.html');
        };
      }
    }
  });

  socket.on('error', (msg) => { alert(`❌ Ошибка боя: ${msg}`); });
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
      elName.style.cursor = 'pointer';
      elName.style.textDecoration = 'underline'; // Визуальный anchor для игрока
      elName.style.color = '#6c5ce7'; // Фиолетовый оттенок вашего интерфейса
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
      elTName.style.cursor = 'pointer';
      elTName.style.textDecoration = 'underline'; // Визуальный anchor для игрока
      elTName.style.color = '#e74c3c'; // Опасный красный цвет для врага
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

  const { maxAttacks, maxDefends } = getMyTacticalLimits();
  
  // Кнопка станет активной, только если игрок выбрал СТРОГО нужное количество зон под свое оружие!
  const hasValidAttack = (maxAttacks === 2) ? (selectedAttackZone && Array.isArray(selectedAttackZone) && selectedAttackZone.length === 2) : !!selectedAttackZone;
  const hasValidDefend = (selectedDefendZones.length === maxDefends);

  strikeBtn.disabled = !(hasValidAttack && hasValidDefend && selectedTargetUuid);
}

function initTacticalClickListeners() {
  const strikeBtn = document.getElementById('strike-action-btn');
  if (strikeBtn && strikeBtn.textContent.includes('ГОРОД')) return;

  const { maxAttacks, maxDefends } = getMyTacticalLimits();

  // 1. СЛУШАТЕЛИ АТАК (Поддержка одноручного и двуручного оружия)
  document.querySelectorAll('.btn-atk').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    const zone = newBtn.getAttribute('data-zone');
    
    // Подсветка выбранных зон
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
            document.querySelector(`.btn-atk[data-zone="${removed}"]`)?.classList.remove('attack-selected');
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

  // 2. СЛУШАТЕЛИ БЛОКОВ (Поддержка динамического капа: 1, 2 или 3 зоны)
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
          document.querySelector(`.btn-def[data-zone="${removedZone}"]`)?.classList.remove('defend-selected');
        }
        selectedDefendZones.push(zone);
        newBtn.classList.add('defend-selected');
      }
      checkStrikeButtonState();
    };
  });

  // 3. ОТПРАВКА ПАКЕТА НА СЕРВЕР
  const strikeActionBtn = document.getElementById('strike-action-btn');
  if (strikeActionBtn) {
    const newStrikeBtn = strikeActionBtn.cloneNode(true);
    strikeActionBtn.parentNode.replaceChild(newStrikeBtn, strikeActionBtn);

    newStrikeBtn.onclick = function() {
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
        attack: selectedAttackZone, // Может улетать как строка ("head") или как массив ["head", "torso"]
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


// 🔥 КЛИЕНТСКИЙ СБОРЩИК БОНУСОВ ШМОТОК ДЛЯ ХАРАКТЕРИСТИК В БОЮ
window.getEquipmentBonusInBattle = function(fighterObj, bonusKey) {
  if (!fighterObj || !fighterObj.equipped) return 0;
  let totalBonus = 0;
  const slots = ['head', 'body', 'legs', 'gloves', 'neck', 'mainHand', 'offHand', 'extra'];
  
  slots.forEach(slot => {
    const itemId = fighterObj.equipped[slot];
    if (itemId) {
      const itemData = window.getItemData ? window.getItemData(itemId) : null;
      if (itemData && itemData.bonus) {
        if (itemData.bonus[bonusKey] !== undefined) totalBonus += itemData.bonus[bonusKey];
        if (itemData.bonus.stats && itemData.bonus.stats[bonusKey] !== undefined) {
          totalBonus += itemData.bonus.stats[bonusKey];
        }
      }
    }
  });
  return totalBonus;
};

// 🔥 ИСПРАВЛЕННЫЙ ТРИГГЕР: ХАРАКТЕРИСТИКИ ИГРОКА В БОЮ
window.openPlayerStatsInBattle = function() {
  const myFighter = [...teamA, ...teamB].find(f => f.uuid === myUuid);
  const pBody = document.getElementById('player-popover-body');
  if (!myFighter || !pBody) return;
  pBody.innerHTML = ''; 

  // Читаем статы из объекта stats, который присылает бэкенд
  const str = Number(myFighter.stats?.strength ?? myFighter.strength ?? 1);
  const agi = Number(myFighter.stats?.agility ?? myFighter.agility ?? 1);
  const end = Number(myFighter.stats?.endurance ?? myFighter.endurance ?? 1);
  const lck = Number(myFighter.stats?.luck ?? myFighter.luck ?? 1);

  // Считаем бонусы через наш боевой метод, чтобы JS не падал
  const gearAgiBonus = window.getEquipmentBonusInBattle(myFighter, 'agility');
  const gearLuckBonus = window.getEquipmentBonusInBattle(myFighter, 'luck');

  const totalAgi = agi + gearAgiBonus;
  const totalLuck = lck + gearLuckBonus;

  const mfInv = (totalAgi * 10);
  const mfAntiInv = (totalAgi * 4);
  const mfCrit = (totalLuck * 10);
  const mfAntiCrit = (totalLuck * 4);

  const stats = [
    { label: '💪 Сила', value: str },
    { label: '🏹 Ловкость', value: totalAgi },
    { label: '🛡️ Выносливость', value: end },
    { label: '🍀 Удача', value: totalLuck },
    { label: '🏹 Мф. Уворота', value: `+${mfInv}%` },
    { label: '🎯 Мф. Антиуворота', value: `+${mfAntiInv}%` },
    { label: '💥 Мф. Крита', value: `+${mfCrit}%` },
    { label: '🛡️ Мф. Антикрита', value: `+${mfAntiCrit}%` }
  ];

  stats.forEach(s => {
    const row = document.createElement('div');
    row.className = 'profile-row';
    row.innerHTML = `<span>${s.label}</span><span style="color:#fff; font-weight:bold;">${s.value}</span>`;
    pBody.appendChild(row);
  });

  document.getElementById('monster-stats-popover').style.display = 'none';
  document.getElementById('player-stats-popover').style.display = 'flex';
};

// 🔥 ИСПРАВЛЕННЫЙ ТРИГГЕР: ХАРАКТЕРИСТИКИ ВРАГА В БОЮ
window.openEnemyStatsInBattle = function() {
  const myFighter = [...teamA, ...teamB].find(f => f.uuid === myUuid);
  if (!myFighter) return;
  const opposingTeam = teamA.includes(myFighter) ? teamB : teamA;
  const targetFighter = opposingTeam.find(e => e.uuid === selectedTargetUuid);
  const mBody = document.getElementById('monster-popover-body');

  if (!targetFighter || targetFighter.currentHp <= 0 || !mBody) return;
  mBody.innerHTML = ''; 

  const str = Number(targetFighter.stats?.strength ?? targetFighter.strength ?? 1);
  const agi = Number(targetFighter.stats?.agility ?? targetFighter.agility ?? 1);
  const end = Number(targetFighter.stats?.endurance ?? targetFighter.endurance ?? 1);
  const lck = Number(targetFighter.stats?.luck ?? targetFighter.luck ?? 1);

  const mfInv = (agi * 10);
  const mfAntiInv = (agi * 4);
  const mfCrit = (lck * 10);
  const mfAntiCrit = (lck * 4);

  const stats = [
    { label: '💪 Сила', value: str },
    { label: '🏹 Ловкость', value: agi },
    { label: '🛡️ Выносливость', value: end },
    { label: '🍀 Удача', value: lck },
    { label: '🏹 Мф. Уворота', value: `+${mfInv}%` },
    { label: '🎯 Мф. Антиуворота', value: `+${mfAntiInv}%` },
    { label: '💥 Мф. Крита', value: `+${mfCrit}%` },
    { label: '🛡️ Мф. Антикрита', value: `+${mfAntiCrit}%` }
  ];

  stats.forEach(s => {
    const row = document.createElement('div');
    row.className = 'profile-row';
    row.innerHTML = `<span>${s.label}</span><span style="color:#fff; font-weight:bold;">${s.value}</span>`;
    mBody.appendChild(row);
  });

  document.getElementById('player-stats-popover').style.display = 'none';
  document.getElementById('monster-stats-popover').style.display = 'flex';
};