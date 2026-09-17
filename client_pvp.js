// ============================================================================
// ===== 🌐 КЛИЕНТСКИЙ МОДУЛЬ БОЯ: ЧАСТЬ 1 — ПОДКЛЮЧЕНИЕ И ПОИСК МАТЧЕЙ =====
// ============================================================================

// Сетевые переменные для управления состоянием текущей битвы на клиенте
let socket = null;          // Объект сокета для обмена пакетами с Node.js бэкендом
let currentRoomId = null;   // Хранит уникальный ID игровой комнаты боя
let serverMyMaxHp = 100;    // Лимит максимального ХП вашего персонажа по расчетам сервера
let serverOppMaxHp = 100;   // Лимит максимального ХП вашего оппонента по расчетам сервера
let potionUsedThisTurn = false; // Маркер применения эликсира здоровья в текущем раунде

// Переменные для хранения выбранных игроком зон удара и блоков
let selectedAttackZone = null;   // Сюда пишется выбранная строка атаки ("head", "legs"...)
let selectedDefendZones = [];    // Массив, куда заносятся 2 выбранные зоны защиты

// Словарь для красивого форматирования логов раунда на русском языке
const ZONE_NAMES = { head: "Голову", breast: "Грудь", torso: "Торс", belt: "Пояс", legs: "Ноги" };

function initSocketConnection() {
  if (socket) return; // Если сокет уже поднят, предотвращаем дублирование
  
  // 🔥 ИСПРАВЛЕНИЕ: Убрали const! Теперь значение пишется в глобальный socket
  socket = io('https://darkworld-server.onrender.com'); 
  
  setupSocketListeners(); // Подключаем слушатели событий сокетов
}

/**
 * 🏆 ОТПРАВКА СИГНАЛА НА PvP (ПОИСК ПРОТИВНИКА НА АРЕНЕ)
 */
window.openServerPvp = function() {
  if (!window.player || window.player.hp <= 0) {
    return alert("Вы слишком слабы для Арены! Восстановите здоровье.");
  }
  
  // Гарантируем, что сокет подключен к серверу прямо перед отправкой запроса
  initSocketConnection();
  
  const myRealMaxHp = window.getMaxHp ? window.getMaxHp(window.player) : (window.player.stats.endurance * 10);
  
  // Отправляем пакет поиска на Арену
  socket.emit('search_match', { playerData: window.player, currentHp: window.player.hp, maxHp: myRealMaxHp });
};

/**
 * 🌲 ОТПРАВКА СИГНАЛА НА PvE (ВЫХОД НА ОХОТУ В ЛЕС)
 */
window.openServerPve = function(monsterKey) {
  if (!window.player || window.player.hp <= 0) {
    return alert("Вы слишком слабы для боя! Восстановите здоровье.");
  }
  
  // Гарантируем, что сокет подключен к серверу прямо перед отправкой запроса
  initSocketConnection();
  
  const myRealMaxHp = window.getMaxHp ? window.getMaxHp(window.player) : (window.player.stats.endurance * 10);
  
  // Отправляем пакет генерации PvE комнаты с монстром
  socket.emit('search_pve_match', { playerData: window.player, monsterKey: monsterKey, maxHp: myRealMaxHp });
};

/**
 * 🎲 АВТОМАТИЧЕСКИЙ СЛУЧАЙНЫЙ ВЫБОР ЗОН (КНОПКА "СЛУЧАЙНО")
 */
window.processServerRandomBattleTurn = function() {
  const pool = ["head", "breast", "torso", "belt", "legs"];
  
  // Выбираем 1 рандомную зону для удара
  selectedAttackZone = pool[Math.floor(Math.random() * pool.length)]; 
  selectedDefendZones = [];
  
  // Набираем 2 уникальные зоны для защиты щитом
  while (selectedDefendZones.length < 2) { 
    const rz = pool[Math.floor(Math.random() * pool.length)]; 
    if (!selectedDefendZones.includes(rz)) selectedDefendZones.push(rz); 
  }
  
  // Визуально перекрашиваем кнопки тактики
  document.querySelectorAll('.attack-zone-btn').forEach(b => {
    b.style.setProperty('background', b.getAttribute('data-zone') === selectedAttackZone ? '#e67e22' : 'rgba(255, 255, 255, 0.05)');
  });
  document.querySelectorAll('.defend-zone-btn').forEach(b => {
    b.style.setProperty('background', selectedDefendZones.includes(b.getAttribute('data-zone')) ? '#3498db' : 'rgba(255, 255, 255, 0.05)');
  });

  // Автоматически прожимаем кнопку атаки на экране боя
  document.getElementById('battle-strike-btn')?.click();
};
// ============================================================================
// ===== 🌐 КЛИЕНТСКИЙ МОДУЛЬ БОЯ: ЧАСТЬ 2 — СЕТЕВЫЕ СЛУШАТЕЛИ И RECONNECT =====
// ============================================================================

function setupSocketListeners() {
  if (!socket) return;
  
  const statusEl = document.getElementById('rt-pvp-status');

  // 🔥 АСИНХРОННЫЙ СТАТУС ПОИСКА: Выводит плашку без блокировки кода игры (БЕЗ ALERT)
  socket.on('search_status', (msg) => {
    if (statusEl) {
      statusEl.textContent = msg;
    } else {
      let notice = document.getElementById('battle-search-notice');
      if (!notice) {
        notice = document.createElement('div');
        notice.id = 'battle-search-notice';
        notice.style.cssText = `
          position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
          background: #1e272e; border: 1px solid #ffc048; color: #fff;
          padding: 12px 24px; border-radius: 8px; font-weight: bold; font-size: 14px;
          z-index: 999999; box-shadow: 0 4px 15px rgba(0,0,0,0.5);
        `;
        document.body.appendChild(notice);
      }
      notice.textContent = `⚔️ Арена: ${msg}`;
    }
  });

  /**
   * 🔥 НАДЕЖНЫЙ СЛУШАТЕЛЬ RECONNECT ПОСЛЕ F5
   * Синхронизирует раунды и ХП. Дает 100мс на прогрузку window.player на ПК
   */
  socket.on('reconnect_battle_success', ({ roomId, isPve, opponent, myMaxHp, oppMaxHp, myCurrentHp, oppCurrentHp, turnCount }) => {
    currentRoomId = roomId; 
    serverMyMaxHp = myMaxHp; 
    serverOppMaxHp = oppMaxHp;
    window.player.hp = myCurrentHp; 

    const finalOppName = opponent.name || opponent.playerData?.name || "Соперник";
    const startMsg = `🔄 ВЫ УСПЕШНО ВЕРНУЛИСЬ В БИТВУ!`;
    
    setTimeout(() => {
      if (window.player) {
        initBattleScreen(finalOppName, opponent.icon || '🐺', myMaxHp, oppMaxHp, startMsg, oppCurrentHp, turnCount);
      }
    }, 100);
  });

/**
   * 🔥 ВОЗВРАЩЕННЫЙ СЛУШАТЕЛЬ: НАЧАЛО PvP ПОЕДИНКА (АРЕНА)
   */
  socket.on('battle_start', ({ roomId, opponent, myMaxHp, oppMaxHp, oppCurrentHp }) => {
    document.getElementById('battle-search-notice')?.remove(); 
    currentRoomId = roomId; 
    serverMyMaxHp = myMaxHp; 
    serverOppMaxHp = oppMaxHp;
    
    const finalOppName = opponent.name || opponent.playerData?.name || "Соперник";
    // 🔥 ФИКС: Передаем oppCurrentHp вместо oppMaxHp в качестве текущего здоровья
    const startOppHp = (oppCurrentHp !== undefined) ? oppCurrentHp : oppMaxHp;
    initBattleScreen(finalOppName, '👤', myMaxHp, oppMaxHp, `⚡ ПОЕДИНОК НАЧАЛСЯ!`, startOppHp, 1);
  });

  /**
   * 🔥 ВОЗВРАЩЕННЫЙ СЛУШАТЕЛЬ: НАЧАЛО PvE ПОЕДИНКА (ЛЕС)
   */
  socket.on('pve_battle_start', ({ roomId, monster, myMaxHp, monsterMaxHp, monsterCurrentHp }) => {
    currentRoomId = roomId; 
    serverMyMaxHp = myMaxHp; 
    serverOppMaxHp = monsterMaxHp;
    // 🔥 ФИКС: Передаем monsterCurrentHp (или monsterMaxHp, если бой абсолютно новый)
    const startMonsterHp = (monsterCurrentHp !== undefined) ? monsterCurrentHp : monsterMaxHp;
    initBattleScreen(monster.name, monster.icon || '👹', myMaxHp, monsterMaxHp, `⚔️ БОЙ НАЧАЛСЯ! ВРАГ: ${monster.name}`, startMonsterHp, 1);
  });

  socket.on('opponent_submitted', () => {
    const log = document.getElementById('battle-log');
    if (log) { const d = document.createElement('div'); d.style.color = '#3498db'; d.textContent = "⏱️ Противник сделал ход!"; log.appendChild(d); log.scrollTop = log.scrollHeight; }
  });

  socket.on('opponent_healed_instant', ({ oppHp, logMsg }) => {
    if (window._activeMonster) window._activeMonster.hp = oppHp;
    if (typeof window._updateBars === 'function') window._updateBars();
    const log = document.getElementById('battle-log');
    if (log) { const d = document.createElement('div'); d.style.color = '#e67e22'; d.textContent = logMsg; log.appendChild(d); log.scrollTop = log.scrollHeight; }
  });

  socket.on('error', (errorMsg) => { alert(`❌ Ошибка: ${errorMsg}`); });

  /**
   * Прием результатов раунда от сервера и разделение полосок ХП
   */
/**
   * Прием результатов раунда от сервера и разделение полосок ХП
   */
  socket.on('round_result', ({ myHp, enemyHp, logs, isOver, resultType, turnCount, serverGold, serverXp }) => {
    const log = document.getElementById('battle-log');
    if (!log) return;

    // 🔥 ИСПРАВЛЕНИЕ: Если сервер прислал пустые или некорректные значения, защищаем клиент от NaN
    const safeMyHp = isNaN(myHp) || myHp === undefined ? 0 : Number(myHp);
    const safeEnemyHp = isNaN(enemyHp) || enemyHp === undefined ? 0 : Number(enemyHp);

    const currentRound = turnCount || window._battleTurnCount || 1;
    const tDiv = document.createElement('div'); 
    tDiv.style.cssText = 'color: #9aa0b5; font-weight: bold; margin-top: 10px; border-top: 1px dashed rgba(255,255,255,0.05); padding-top: 4px;';
    tDiv.textContent = `--- Раунд ${currentRound} ---`; log.appendChild(tDiv);
    
    logs.forEach(msg => {
      const d = document.createElement('div'); d.textContent = msg;
      if (msg.includes('пробил') || msg.includes('нанес вам') || msg.includes('погиб')) d.className = 'battle-msg-damage-player';
      if (msg.includes('⚔️')) d.className = 'battle-msg-hit';
      log.appendChild(d);
    });

    // 🔥 ИСПРАВЛЕНИЕ: Сервер уже присылает ЛИЧНО для этого сокета его ХП (myHp) и врага (enemyHp). 
    // Больше не нужно сверять строки room_id и путаться в P1/P2! Назначаем напрямую:
    window.player.hp = safeMyHp; 
    if (window._activeMonster) {
      window._activeMonster.hp = safeEnemyHp; 
    }

    if (typeof window._updateBars === 'function') window._updateBars();
    log.scrollTop = log.scrollHeight;
    window._battleTurnCount = currentRound + 1;

    // Снимаем блокировку «Расчет сервером...», возвращая кнопке рабочее состояние
    const strikeBtn = document.getElementById('battle-strike-btn');
    if (strikeBtn && !isOver) { 
      strikeBtn.style.background = 'var(--btn)'; 
      strikeBtn.textContent = 'АТАКОВАТЬ'; 
    }

    if (isOver) {
      const modal = document.getElementById('battle-modal');
      modal?.querySelector('#battle-controls-zone')?.style.setProperty('display', 'none', 'important');
      
      // 🔥 ФИКС БАГА: Мгновенно сносим инлайн-кнопку зелья, если бой закончился!
      document.getElementById('server-inline-potion-btn')?.remove();
      const resDiv = document.createElement('div'); resDiv.style.cssText = 'margin-top:15px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.1); font-weight:bold;';
      
      // Честно проверяем победу: в PvE или PvP если у нас осталось > 0 HP или сервер прислал нужный флаг
      const isAmIPlayer1 = currentRoomId && currentRoomId.startsWith(`room_${window.player.id}_`);
      const didIWin = (isAmIPlayer1 && resultType === 'p1_win') || 
                      (!isAmIPlayer1 && resultType === 'p2_win') || 
                      (currentRoomId.startsWith('pve_') && resultType === 'p1_win');
      
      resDiv.textContent = didIWin ? "🏁 ПОБЕДА! Награда зачислена." : "🏁 ВАС ОДОЛЕЛИ. Воскрешение в городе (20% HP).";
      resDiv.className = didIWin ? 'battle-msg-hit' : 'battle-msg-damage-player';
      log.appendChild(resDiv);

      if (serverGold !== undefined && didIWin) window.player.gold = serverGold;
      if (serverXp !== undefined && didIWin) window.player.xp = serverXp;
      
      window.player.hp = didIWin ? window.player.hp : Math.max(1, Math.floor(serverMyMaxHp * 0.2));

      const closeHandler = function() {
        window.closeBattleModal();
        if (window.checkLevelUp) window.checkLevelUp(true); 
        if (window.render) window.render();
      };
      if (modal) {
        if (modal.querySelector('#battle-action-btn')) { modal.querySelector('#battle-action-btn').style.setProperty('display', 'block', 'important'); modal.querySelector('#battle-action-btn').onclick = closeHandler; }
        if (modal.querySelector('#battle-close-btn')) { modal.querySelector('#battle-close-btn').style.setProperty('display', 'flex', 'important'); modal.querySelector('#battle-close-btn').onclick = closeHandler; }
      }
      log.scrollTop = log.scrollHeight;
    }
  });
}
// ============================================================================
// ===== 🌐 КЛИЕНТСКИЙ МОДУЛЬ БОЯ: ЧАСТЬ 3.1 — ЖЕЛЕЗНЫЕ НИКНЕЙМЫ И ПОПОБЕРЫ =====
// ============================================================================

/**
 * РЕНДЕРИНГ ЭКРАНА БОЯ (ЗАГРУЗКА ШАБЛОНА, БАНКИ, ХАРАКТЕРИСТИКИ И ХП)
 */
function initBattleScreen(oppName, oppIcon, myMaxHp, oppMaxHp, startLogText, currentOppHp, serverTurn) {
  fetch('battle_template.html').then(res => res.text()).then(htmlText => {
    const modal = document.getElementById('battle-modal');
    if (!modal) return;
    
    // Инжектим HTML структуру арены из шаблона
    modal.innerHTML = htmlText;

    // 🔥 ФИКС: Жестко берем переданное серверное здоровье без оглядки на старые сессии
    const targetOppHp = (currentOppHp !== undefined && currentOppHp !== null) ? Number(currentOppHp) : Number(oppMaxHp);
    
    window._activeMonster = { 
      name: oppName, 
      icon: oppIcon, 
      hp: targetOppHp, // Записываем точное текущее здоровье!
      maxHp: oppMaxHp,
      stats: window.MONSTER_DATABASE ? Object.values(window.MONSTER_DATABASE).find(m => m.name === oppName)?.stats : null
    };
    window._battleTurnCount = serverTurn || 1;

    // 🔥 ИСПРАВЛЕНИЕ НИКНЕЙМОВ: Ищем текстовые блоки "Вы" и "Монстр" и меняем их на РЕАЛЬНЫЕ ИМЕНА ИГРОКОВ
    let allElements = modal.querySelectorAll('div, span, p, h3, h4');
    let playerCard = null;
    let monsterCard = null;

    allElements.forEach(el => {
      let txt = el.textContent.trim();
      if (txt === 'Вы' || el.id === 'bf-player-name') {
        el.textContent = window.player ? window.player.name : "Вы"; 
        playerCard = el.closest('.battle-character-card') || el.parentNode || el;
      }
      if (txt === 'Монстр' || txt === 'Противник' || el.id === 'bf-monster-name') {
        el.textContent = oppName; 
        monsterCard = el.closest('.battle-character-card') || el.parentNode || el;
      }
    });

    // Безопасно очищаем лог боя и выводим приветственную строку раунда
    const log = modal.querySelector('#battle-log');
    if (log) log.innerHTML = `<div class="battle-msg-start">${startLogText}</div>`;

    // Сносим старые встроенные поповеры из шаблона, чтобы они больше не ломали верстку экрана
    modal.querySelector('#player-stats-popover')?.remove();
    modal.querySelector('#monster-stats-popover')?.remove();

    /**
     * 🔥 ФУНКЦИЯ ДИНАМИЧЕСКИХ ОКНО СТАТОВ: Генерирует красивый ровный поповер на чистом JS
     * Защищает от Event Bubbling (всплытия кликов), из-за которого закрывался весь бой при клике на крестик!
     */
    function createCleanPopover(title, contentHtml, isMonster = false) {
      document.getElementById('custom-battle-popover')?.remove(); // Чистим старые окна

      const pop = document.createElement('div');
      pop.id = 'custom-battle-popover';
      pop.style.cssText = `
        position: fixed !important; top: 50% !important; left: 50% !important;
        transform: translate(-50%, -50%) !important; width: 80% !important; max-width: 300px !important;
        background: #111a2e !important; border: 2px solid ${isMonster ? '#e74c3c' : '#6c5ce7'} !important;
        border-radius: 14px !important; padding: 16px !important; z-index: 999999 !important;
        box-shadow: 0 10px 30px rgba(0,0,0,0.8), 0 0 0 2000px rgba(0,0,0,0.5) !important;
      `;

      pop.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; width:100%; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px; margin-bottom:8px;">
          <span style="font-weight:bold; color:#fff; font-size:14px;">${title}</span>
          <button id="close-custom-pop" style="background:rgba(255,255,255,0.1); border:none; color:#fff; border-radius:50%; width:26px; height:26px; cursor:pointer; font-weight:bold;">✕</button>
        </div>
        <div style="color:#fff; font-size:13px; line-height:1.4;">${contentHtml}</div>
      `;

      document.body.appendChild(pop);

      // Крестик закрытия удаляет ТОЛЬКО сам поповер, бой больше не сбрасывается!
      document.getElementById('close-custom-pop').onclick = function(ev) {
        ev.preventDefault(); ev.stopPropagation();
        pop.remove();
      };
    }

    // Привязываем вызов характеристик к клику по никнейму игрока
    if (playerCard) {
      playerCard.style.cursor = 'pointer';
      playerCard.onclick = function(e) {
        if (e.target.textContent === '✕' || e.target.closest('button')) return;
        e.preventDefault(); e.stopPropagation();
        
        const pStats = window.player?.stats || { strength: 10, agility: 10, endurance: 10, intellect: 10, luck: 10 };
        const atk = window.getAtk ? window.getAtk(window.player) : '???';
        const def = window.getDef ? window.getDef(window.player) : '???';

        const html = `
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>💪 Сила:</span><strong>${pStats.strength}</strong></div>
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>🏹 Ловкость:</span><strong>${pStats.agility}</strong></div>
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>🛡️ Выносливость:</span><strong>${pStats.endurance}</strong></div>
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>🔮 Интеллект:</span><strong>${pStats.intellect}</strong></div>
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>🍀 Удача:</span><strong>${pStats.luck}</strong></div>
          <hr style="border:0; border-top:1px solid rgba(255,255,255,0.08); margin:6px 0;">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>⚔️ Атака:</span><span style="color:#2ecc71; font-weight:bold;">${atk}</span></div>
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>🛡️ Защита:</span><span style="color:#3498db; font-weight:bold;">${def} ед.</span></div>
        `;
        createCleanPopover(`Характеристики: ${window.player?.name || 'Вы'}`, html, false);
      };
    }

    // Привязываем вызов характеристик к клику по никнейму врага
    if (monsterCard) {
      monsterCard.style.cursor = 'pointer';
      monsterCard.onclick = function(e) {
        if (e.target.textContent === '✕' || e.target.closest('button')) return;
        e.preventDefault(); e.stopPropagation();
        
        const mStats = window._activeMonster?.stats;
        const html = mStats ? `
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>💪 Сила:</span><strong>${mStats.strength}</strong></div>
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>🏹 Ловкость:</span><strong>${mStats.agility}</strong></div>
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>🛡️ Выносливость:</span><strong>${mStats.endurance}</strong></div>
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>🔮 Интеллект:</span><strong>${mStats.intellect}</strong></div>
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>🍀 Удача:</span><strong>${mStats.luck}</strong></div>
        ` : `<div style="text-align:center; color:#9aa0b5; padding:4px;">Характеристики игрока скрыты туманом войны!</div>`;
        
        createCleanPopover(`Параметры: ${oppName}`, html, true);
      };
    }
    // ============================================================================
// ===== 🌐 КЛИЕНТСКИЙ МОДУЛЬ БОЯ: ЧАСТЬ 3.2 — ЗЕЛЬЯ, ТАКТИКА И ШКАЛЫ ХП =====
// ============================================================================

    // Разворачиваем тактическую панель выбора зон раунда
    if (modal.querySelector('#battle-controls-zone')) {
      modal.querySelector('#battle-controls-zone').style.setProperty('display', 'flex', 'important');
    }
    setupTacticalControls();

    // 🧪 ЖЕЛЕЗНЫЙ ВЫВОД ИНЛАЙН-КНОПКИ ЗЕЛЬЯ ЛЕЧЕНИЯ СЛЕДОМ ЗА ОТРИСОВКОЙ ЛОГА
    try {
      let bSlot = modal.querySelector('#bf-player-potion-slot') || modal.querySelector('#player-potion-slot');
      let potId = window.player?.equipped?.potion;
      modal.querySelector('#server-inline-potion-btn')?.remove(); // Чистим старые дубликаты

      if (potId) {
        const pData = window.getItemData ? window.getItemData(potId) : null;
        
        if (pData && log && log.parentNode) {
          if (bSlot) {
            bSlot.textContent = pData.icon;
            bSlot.style.cssText = `display:flex!important; background:#222f3e!important; border:2px solid #2ecc71!important; border-radius:10px!important; font-size:26px!important; width:50px!important; height:50px!important; align-items:center; justify-content:center; cursor:pointer;`;
          }

          // Генерируем инлайн-кнопку лечения прямо над текстовой историей поединка
          let btn = document.createElement('button'); btn.id = 'server-inline-potion-btn';
          btn.style.cssText = `margin:10px 0; width:100%; background:#2ecc71; border:none; color:#fff; padding:12px; font-weight:bold; border-radius:10px; cursor:pointer; display:block!important;`;
          btn.innerHTML = `🧪 Выпить: ${pData.name} (+${pData.heal} HP)`;
          log.parentNode.insertBefore(btn, log);

            btn.onclick = function(e) {
            if (e) e.stopPropagation();
            
            // 🔥 ФИКС: Если игрок уже погиб, запрещаем пить зелье!
            if (window.player.hp <= 0) {
              alert("Вы не можете пить зелье, будучи поверженным!");
              btn.remove();
              return;
            }

            btn.remove();
            window.player.hp = Math.min(serverMyMaxHp, window.player.hp + pData.heal);
            window._updateBars();
            if (window.player.equipped) window.player.equipped.potion = null;
            if (bSlot) { bSlot.textContent = '💨'; bSlot.style.cssText = `display:flex; opacity:0.2; pointer-events:none;`; }
            socket.emit('instant_use_potion', { roomId: currentRoomId });
          };
          if (bSlot) bSlot.onclick = (e) => { if (e) e.stopPropagation(); document.getElementById('server-inline-potion-btn')?.click(); };
        }
      } else if (bSlot) {
        bSlot.textContent = '💨';
        bSlot.style.cssText = 'opacity:0.2!important; display:flex!important; width:50px; height:50px; align-items:center; justify-content:center; border:1px dashed rgba(255,255,255,0.2); border-radius:10px; pointer-events:none;';
      }
    } catch(e) { console.error("Ошибка рендеринга зелья здоровья:", e); }

    // Логика кнопок тактики поединка
    if (modal.querySelector('#battle-random-strike-btn')) modal.querySelector('#battle-random-strike-btn').onclick = window.processServerRandomBattleTurn;
    
    const strikeBtn = modal.querySelector('#battle-strike-btn');
    if (strikeBtn) {
      strikeBtn.onclick = function() {
        if (!selectedAttackZone || selectedDefendZones.length !== 2) return alert("Выберите 1 зону атаки и 2 зоны защиты!");
        this.style.background = '#57606f'; 
        this.textContent = "Расчет сервером...";
        
        // Отправляем чистую плоскую структуру полей
        socket.emit('submit_turn', { roomId: currentRoomId, attack: selectedAttackZone, defends: selectedDefendZones });
      };
    }

    // Функция отрисовки шкал ХП
    window._updateBars = function() {
      const pFill = modal.querySelector('#bf-player-hp-fill'), pText = modal.querySelector('#bf-player-hp-text');
      const mFill = modal.querySelector('#bf-monster-hp-fill'), mText = modal.querySelector('#bf-monster-hp-text');
      
      const currentLocalHp = window.player ? window.player.hp : 0;
      const currentMonsterHp = window._activeMonster ? window._activeMonster.hp : 0;

      if (pFill) pFill.style.width = `${(Math.max(0, currentLocalHp) / serverMyMaxHp) * 100}%`;
      if (pText) pText.textContent = `${Math.max(0, currentLocalHp)} / ${serverMyMaxHp}`;
      if (mFill) mFill.style.width = `${(Math.max(0, currentMonsterHp) / serverOppMaxHp) * 100}%`;
      if (mText) mText.textContent = `${Math.max(0, currentMonsterHp)} / ${serverOppMaxHp}`;

      // 🔥 ФИКС: Если кто-то погиб (игрок или монстр), мгновенно удаляем инлайн-кнопку лечения с экрана!
      if (currentLocalHp <= 0 || currentMonsterHp <= 0) {
        document.getElementById('server-inline-potion-btn')?.remove();
      }
    };
    
    window._updateBars();
    modal.classList.add('active'); modal.style.setProperty('display', 'flex');
  });
}

function setupTacticalControls() {
  selectedAttackZone = null; selectedDefendZones = [];
  document.querySelectorAll('.attack-zone-btn').forEach(btn => {
    btn.onclick = function() {
      document.querySelectorAll('.attack-zone-btn').forEach(b => b.style.setProperty('background', 'rgba(255, 255, 255, 0.05)'));
      selectedAttackZone = this.getAttribute('data-zone'); this.style.setProperty('background', '#e67e22');
    };
  });
  document.querySelectorAll('.defend-zone-btn').forEach(btn => {
    btn.onclick = function() {
      const zone = this.getAttribute('data-zone');
      if (selectedDefendZones.includes(zone)) {
        selectedDefendZones = selectedDefendZones.filter(z => z !== zone);
        this.style.setProperty('background', 'rgba(255, 255, 255, 0.05)'); return;
      }
      if (selectedDefendZones.length >= 2) {
        const removed = selectedDefendZones.shift();
        const oldB = document.querySelector(`.defend-zone-btn[data-zone="${removed}"]`);
        if (oldB) oldB.style.setProperty('background', 'rgba(255, 255, 255, 0.05)');
      }
      selectedDefendZones.push(zone); this.style.setProperty('background', '#3498db');
    };
  });
}

function deleteCustomPopover() {
  document.getElementById('custom-battle-popover')?.remove();
}

window.closeBattleModal = function() {
  const m = document.getElementById('battle-modal'); 
  if (m) { 
    m.classList.remove('active'); 
    m.style.setProperty('display', 'none', 'important'); 
  }
  // 🔥 Гарантированная зачистка кнопки зелья при закрытии экрана боя
  document.getElementById('server-inline-potion-btn')?.remove();
  deleteCustomPopover();
};