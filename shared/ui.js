// ============================================================================
// ===== 🎨 ЕДИНЫЙ UI-МОДУЛЬ ИГРЫ (SHARED/UI.JS) =====
// ===== Профиль + Инвентарь + Поповер предмета — работает на всех страницах =====
// ===== Использует window.socket и window.player =====
// ============================================================================

(function() {
  'use strict';

  // ============================================================================
  // 🔥 УНИВЕРСАЛЬНЫЙ РЕЗОЛВЕР ПУТЕЙ К АССЕТАМ
  // Работает и в корне (index.html), и в подпапках (world/, shop/, tower/, battle/)
  // ============================================================================
  window.getAssetPath = function(path) {
    if (!path) return 'assets/avatars/hero1.png';
    if (path.startsWith('http')) return path;

    // Чистим ведущие слеши и ../
    const clean = path.replace(/^\/+/, '').replace(/^(\.\.\/)+/, '');

    // Определяем, в какой папке мы находимся
    const parts = window.location.pathname.split('/').filter(Boolean);
    const curDir = parts.slice(0, -1).pop() || '';
    const subdirs = ['world', 'shop', 'tower', 'battle'];

    if (subdirs.includes(curDir)) {
      return '../' + clean;
    }
    return clean;
  };

  // ============================================================================
  // ВНУТРЕННЕЕ СОСТОЯНИЕ
  // ============================================================================
  const _state = {
    currentTab: 'equipment',       // Текущая вкладка инвентаря
    currentProfileTab: 'main',     // Текущая вкладка профиля
    tempStatDistribution: { strength: 0, agility: 0, endurance: 0, luck: 0 },
    tempStatPoints: 0,
    profileBodyEl: null,           // Ссылка на DOM модалки профиля
    initDone: false
  };

  // ============================================================================
  // ХЕЛПЕР: получить отрисованную структуру модалки
  // ============================================================================
  function getSocket() {
    // Ищем сокет по всем доступным источникам
    if (window.socket && window.socket.connected) return window.socket;
    if (window.worldSocket && window.worldSocket.connected) return window.worldSocket;
    if (window.towerSocket && window.towerSocket.connected) return window.towerSocket;
    if (window.shopSocket && window.shopSocket.connected) return window.shopSocket;
    return window.socket || window.worldSocket || window.towerSocket || window.shopSocket || null;
  }

  // ============================================================================
  // ХЕЛПЕР: получить данные предмета (экипировка + ресурсы мира)
  // ============================================================================
  function getItemData(itemId) {
    if (!itemId) return null;

    // 1. Стандартная база
    if (window.getItemData) {
      const d = window.getItemData(itemId);
      if (d) return d;
    }

    // 2. Ресурсы мира
    if (window.currentMapData && window.currentMapData.resourcesDB) {
      const r = window.currentMapData.resourcesDB[itemId];
      if (r) {
        return {
          name: r.name,
          icon: r.icon,
          desc: 'Ресурс для крафта',
          slotType: 'resource',
          price: 1,
          level: 1
        };
      }
    }

    return null;
  }

  // ============================================================================
  // ХЕЛПЕР: собрать бонусы экипировки
  // ============================================================================
  function getEquipmentBonus(playerData, bonusKey) {
    if (!playerData || !playerData.equipped) return 0;
    let total = 0;
    const slots = ['head', 'body', 'legs', 'gloves', 'neck', 'mainHand', 'offHand', 'extra', 'potion', 'scroll'];

    slots.forEach(slot => {
      const raw = playerData.equipped[slot];
      const itemId = (raw && typeof raw === 'object') ? raw.id : raw;
      if (!itemId) return;
      const item = getItemData(itemId);
      if (item && item.bonus) {
        if (item.bonus[bonusKey] !== undefined) total += item.bonus[bonusKey];
        if (item.bonus.stats && item.bonus.stats[bonusKey] !== undefined) total += item.bonus.stats[bonusKey];
      }
    });

    if (Array.isArray(playerData.equipped.rings)) {
      playerData.equipped.rings.forEach(raw => {
        const itemId = (raw && typeof raw === 'object') ? raw.id : raw;
        if (!itemId) return;
        const item = getItemData(itemId);
        if (item && item.bonus) {
          if (item.bonus[bonusKey] !== undefined) total += item.bonus[bonusKey];
          if (item.bonus.stats && item.bonus.stats[bonusKey] !== undefined) total += item.bonus.stats[bonusKey];
        }
      });
    }

    return total;
  }

  function getMaxHp(playerData) {
    if (!playerData) return 10;

    const baseEnd = Number(playerData.stats?.endurance || playerData.endurance || 1);
    const level = Number(playerData.level || 1);
    const gearEnd = getEquipmentBonus(playerData, 'endurance');
    const gearHp = getEquipmentBonus(playerData, 'hp');

    const totalEnd = baseEnd + gearEnd;

    // 🔥 НОВАЯ ФОРМУЛА (синхронизирована с db_helper.js)
    const baseHp = 30 + (level * 15);
    const endBonus = totalEnd * 4;

    return Math.floor(baseHp + endBonus + gearHp);
  }

function getAtk(playerData) {
  if (!playerData) return 0;
  const str = Number(playerData.stats?.strength || playerData.strength || 1);
  const baseAtk = Math.floor(2 + ((str + getEquipmentBonus(playerData, 'strength')) * 1.5));

  // 🔥 Средний ATK от шмота (для отображения)
  let gearAtk = 0;
  if (playerData.equipped) {
    const slots = ['head', 'body', 'legs', 'gloves', 'neck', 'mainHand', 'offHand', 'extra'];
    const processItem = (itemId) => {
      if (!itemId) return;
      const item = getItemData(itemId);
      if (!item || !item.bonus) return;

      if (item.bonus.atkMin !== undefined && item.bonus.atkMax !== undefined) {
        gearAtk += Math.floor((item.bonus.atkMin + item.bonus.atkMax) / 2);
      } else if (item.bonus.atk !== undefined) {
        gearAtk += item.bonus.atk;
      }
    };
    slots.forEach(slot => processItem(playerData.equipped[slot]));
    if (Array.isArray(playerData.equipped.rings)) {
      playerData.equipped.rings.forEach(processItem);
    }
  }

  return baseAtk + gearAtk;
}
// 🔥 Диапазон ATK (min-max) для отображения
function getAtkRange(playerData) {
  if (!playerData) return '0';

  const str = Number(playerData.stats?.strength || playerData.strength || 1);
  const baseAtk = Math.floor(2 + ((str + getEquipmentBonus(playerData, 'strength')) * 1.5));

  let minBonus = 0;
  let maxBonus = 0;

  if (playerData.equipped) {
    const slots = ['head', 'body', 'legs', 'gloves', 'neck', 'mainHand', 'offHand', 'extra'];
    const processItem = (itemId) => {
      if (!itemId) return;
      const item = getItemData(itemId);
      if (!item || !item.bonus) return;

      if (item.bonus.atkMin !== undefined && item.bonus.atkMax !== undefined) {
        minBonus += item.bonus.atkMin;
        maxBonus += item.bonus.atkMax;
      } else if (item.bonus.atk !== undefined) {
        minBonus += item.bonus.atk;
        maxBonus += item.bonus.atk;
      }
    };
    slots.forEach(slot => processItem(playerData.equipped[slot]));
    if (Array.isArray(playerData.equipped.rings)) {
      playerData.equipped.rings.forEach(processItem);
    }
  }

  const minAtk = baseAtk + minBonus;
  const maxAtk = baseAtk + maxBonus;

  if (minAtk === maxAtk) return String(minAtk);
  return `${minAtk}-${maxAtk}`;
}
  function getDef(playerData) {
    if (!playerData) return 0;
    const end = Number(playerData.stats?.endurance || playerData.endurance || 1);
    return Math.floor((end + getEquipmentBonus(playerData, 'endurance')) * 0.5) + getEquipmentBonus(playerData, 'def');
  }

  function xpToNext(level) {
    const nextLevel = level + 1;
    if (window.XP_TABLE && nextLevel < window.XP_TABLE.length) return window.XP_TABLE[nextLevel];
    return nextLevel * 1000;
  }

  // ============================================================================
  // ДИНАМИЧЕСКОЕ СОЗДАНИЕ МОДАЛОК (если их нет на странице)
  // ============================================================================
  function injectModals() {
    // --- Профиль ---
    if (!document.getElementById('profile-modal')) {
      const modal = document.createElement('div');
      modal.id = 'profile-modal';
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h3>📊 Профиль Героя</h3>
            <button class="close-btn" data-ui-close="profile">✕</button>
          </div>
          <div class="modal-body-stats"></div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    // --- Инвентарь ---
    if (!document.getElementById('inventory-modal')) {
      const modal = document.createElement('div');
      modal.id = 'inventory-modal';
      modal.className = 'modal-overlay';
      modal.style.display = 'none';
      modal.innerHTML = `
        <div class="modal-content" style="display: flex; flex-direction: column; max-width: 480px; height: auto;">
          <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h3 style="margin: 0; font-size: 18px;">🎒 Инвентарь и Снаряжение</h3>
            <button class="close-btn" data-ui-close="inventory">✕</button>
          </div>

          <!-- Кукла -->
          <div class="inventory-top-doll-section" style="display: flex; justify-content: center; align-items: center; width: 100%; margin: 0 auto 8px;">
            <div class="inv-equipment-doll" style="display: grid; grid-template-columns: 44px 160px 44px; gap: 12px; align-items: center; justify-content: center; width: 100%; max-width: 280px;">
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <div id="eslot-head" class="inv-slot" style="width:44px;height:44px;padding:0;display:flex;align-items:center;justify-content:center;">🪖</div>
                <div id="eslot-neck" class="inv-slot" style="width:44px;height:44px;padding:0;display:flex;align-items:center;justify-content:center;">📿</div>
                <div id="eslot-gloves" class="inv-slot" style="width:44px;height:44px;padding:0;display:flex;align-items:center;justify-content:center;">🧤</div>
                <div id="eslot-mainHand" class="inv-slot" style="width:44px;height:44px;padding:0;display:flex;align-items:center;justify-content:center;">⚔️</div>
              </div>
              <div id="inv-avatar-frame" style="display:flex;justify-content:center;align-items:center;overflow:hidden;border-radius:14px;border:2px solid var(--btn);width:160px;height:160px;padding:0;margin:0 auto;">
                <img id="inv-hero-avatar" src="../assets/avatars/hero1.png" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">
              </div>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <div id="eslot-body" class="inv-slot" style="width:44px;height:44px;padding:0;display:flex;align-items:center;justify-content:center;">👕</div>
                <div id="eslot-legs" class="inv-slot" style="width:44px;height:44px;padding:0;display:flex;align-items:center;justify-content:center;">🥾</div>
                <div id="eslot-extra" class="inv-slot" style="width:44px;height:44px;padding:0;display:flex;align-items:center;justify-content:center;">✨</div>
                <div id="eslot-offHand" class="inv-slot" style="width:44px;height:44px;padding:0;display:flex;align-items:center;justify-content:center;">🛡️</div>
              </div>
            </div>
          </div>

          <!-- Бижутерия -->
          <div style="display:flex;justify-content:space-between;gap:6px;width:100%;max-width:280px;margin:0 auto 10px;">
            <div id="eslot-potion" class="inv-slot" style="flex:1;height:40px;padding:0;display:flex;align-items:center;justify-content:center;">🧪</div>
            <div id="eslot-ring-0" class="inv-slot" style="flex:1;height:40px;padding:0;display:flex;align-items:center;justify-content:center;">💍</div>
            <div id="eslot-ring-1" class="inv-slot" style="flex:1;height:40px;padding:0;display:flex;align-items:center;justify-content:center;">💍</div>
            <div id="eslot-ring-2" class="inv-slot" style="flex:1;height:40px;padding:0;display:flex;align-items:center;justify-content:center;">💍</div>
            <div id="eslot-scroll" class="inv-slot" style="flex:1;height:40px;padding:0;display:flex;align-items:center;justify-content:center;">📜</div>
          </div>

          <!-- Вкладки -->
          <div class="inv-tabs">
            <button class="inv-tab active" data-tab="equipment">Амуниция</button>
            <button class="inv-tab" data-tab="resources">Ресурсы</button>
            <button class="inv-tab" data-tab="consumables">Расходники</button>
          </div>

          <!-- Сетка -->
          <div id="inventory-content" class="inv-content"></div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    // --- Поповер предмета ---
    if (!document.getElementById('item-info-popover')) {
      const popover = document.createElement('div');
      popover.id = 'item-info-popover';
      popover.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:8px;">
          <h4 id="popover-item-name" style="margin:0;font-size:16px;font-weight:bold;color:#fff;">Название</h4>
          <button data-ui-close="popover" style="background:transparent;border:none;color:var(--hint);font-size:20px;cursor:pointer;padding:2px 6px;">✕</button>
        </div>
        <div style="display:flex;gap:14px;align-items:center;background:rgba(255,255,255,0.03);padding:12px;border-radius:10px;">
          <div id="popover-item-icon" style="font-size:34px;min-width:55px;height:55px;background:rgba(0,0,0,0.3);border-radius:8px;display:flex;align-items:center;justify-content:center;">🗡️</div>
          <div id="popover-item-desc" style="font-size:13px;color:var(--hint);line-height:1.5;white-space:pre-line;">Описание...</div>
        </div>
        <button id="popover-item-action-btn" class="battle-btn-finish"></button>
      `;
      document.body.appendChild(popover);
    }
  }

  // ============================================================================
  // ПРОФИЛЬ
  // ============================================================================
  function openProfile() {
  const modal = document.getElementById('profile-modal');
  if (!modal || !window.player) return;

  const statsBody = modal.querySelector('.modal-body-stats');
  if (!statsBody) return;

  // 🔥 ЛЕНИВАЯ ПОДПИСКА на load_game_success (один раз)
  if (window.socket && !window.__uiLoadGameBound) {
    window.__uiLoadGameBound = true;
    window.socket.on('load_game_success', (data) => {
      if (!data || !data.player) return;
      console.log('☁️ [UI] Профиль обновлён — сброс буфера');

      // Сброс буфера статов
      _state.tempStatDistribution = { strength: 0, agility: 0, endurance: 0, luck: 0 };
      _state.tempStatPoints = data.player.statPoints || 0;

      // Обновляем открытый профиль
      const m = document.getElementById('profile-modal');
      if (m && m.classList.contains('active')) {
        openProfile();
      }

      // Обновляем открытый инвентарь
      const im = document.getElementById('inventory-modal');
      if (im && im.style.display === 'flex') {
        renderInventory();
      }
    });
  }

  // 🔥 Сброс буфера ТОЛЬКО при первом открытии
  const wasOpen = modal.classList.contains('active');
  if (!wasOpen) {
    _state.tempStatDistribution = { strength: 0, agility: 0, endurance: 0, luck: 0 };
    _state.tempStatPoints = window.player.statPoints || 0;
  }

  modal.classList.add('active');
  modal.style.display = 'flex';
  statsBody.innerHTML = '';

    const p = window.player;
    const nextXp = xpToNext(p.level);
    const currentXp = p.xp || 0;

    // Верхний блок
    const rowsData = [
      { label: '💰 Золото', value: (p.gold || 0) + ' монет' },
      { label: '❤️ Здоровье', value: (p.hp || 0) + ' / ' + getMaxHp(p) },
      { label: '✨ Опыт', value: currentXp + '/' + nextXp },
      { label: '⚔️ Атака', value: getAtkRange(p) },         // 🔥 ДИАПАЗОН
      { label: '🛡️ Защита', value: getDef(p) + ' ед.' }
    ];

    rowsData.forEach(d => {
      const row = document.createElement('div');
      row.className = 'profile-row';
      row.innerHTML = `<span>${d.label}</span><span>${d.value}</span>`;
      statsBody.appendChild(row);
    });

    const hr = document.createElement('hr');
    hr.style.cssText = 'border:0;border-top:1px solid rgba(255,255,255,0.1);margin:12px 0;';
    statsBody.appendChild(hr);

    // Вкладки
    const tabs = document.createElement('div');
    tabs.style.cssText = 'display:flex;gap:8px;margin-bottom:15px;justify-content:center;';

    const btnMain = document.createElement('button');
    btnMain.textContent = '📊 Основные';
    btnMain.style.cssText = 'flex:1;padding:8px;border-radius:8px;border:none;font-weight:bold;cursor:pointer;background:' + (_state.currentProfileTab !== 'modifiers' ? 'var(--btn)' : 'rgba(255,255,255,0.05)') + ';color:' + (_state.currentProfileTab !== 'modifiers' ? '#fff' : 'var(--hint)') + ';';
    btnMain.onclick = () => { _state.currentProfileTab = 'main'; openProfile(); };

    const btnMods = document.createElement('button');
    btnMods.textContent = '💥 Модификаторы';
    btnMods.style.cssText = 'flex:1;padding:8px;border-radius:8px;border:none;font-weight:bold;cursor:pointer;background:' + (_state.currentProfileTab === 'modifiers' ? 'var(--btn)' : 'rgba(255,255,255,0.05)') + ';color:' + (_state.currentProfileTab === 'modifiers' ? '#fff' : 'var(--hint)') + ';';
    btnMods.onclick = () => { _state.currentProfileTab = 'modifiers'; openProfile(); };

    tabs.appendChild(btnMain);
    tabs.appendChild(btnMods);
    statsBody.appendChild(tabs);

    // Вкладка "Основные"
    if (_state.currentProfileTab !== 'modifiers') {
      const pointsDiv = document.createElement('div');
      pointsDiv.style.cssText = 'margin:5px 0 10px 0;font-weight:bold;font-size:16px;color:#f1c40f;text-align:center;';
      pointsDiv.textContent = 'Доступно очков: ' + _state.tempStatPoints;
      statsBody.appendChild(pointsDiv);

      const labels = { strength: '💪 Сила', agility: '🏹 Ловкость', endurance: '🛡️ Выносливость', luck: '🍀 Удача' };

      ['strength', 'agility', 'endurance', 'luck'].forEach(key => {
        const row = document.createElement('div');
        row.className = 'profile-row';

        const baseVal = Number(p.stats?.[key] ?? p[key] ?? 1);
        const gearBonus = getEquipmentBonus(p, key);
        const tempAdded = _state.tempStatDistribution[key];
        const totalVal = baseVal + gearBonus + tempAdded;

        const left = document.createElement('span');
        left.textContent = labels[key];

        const right = document.createElement('span');
        right.style.cssText = 'display:flex;align-items:center;gap:4px;';

        let html = '<strong style="color:#fff;font-size:15px;">' + totalVal + '</strong> ';
        if (tempAdded > 0) html += '<span style="color:#a29bfe;font-size:12px;font-weight:bold;">(+' + tempAdded + ')</span> ';
        html += '<span style="color:var(--hint);font-size:12px;">(' + baseVal + ')</span>';
        if (gearBonus > 0) html += ' <span style="color:#2ecc71;font-size:12px;font-weight:bold;">(+' + gearBonus + ')</span>';

        right.innerHTML = '<span style="margin-right:8px;">' + html + '</span>';

        const btnBox = document.createElement('div');
        btnBox.style.cssText = 'display:flex;gap:4px;';

        if (tempAdded > 0) {
          const minus = document.createElement('button');
          minus.textContent = '-';
          minus.style.cssText = 'background:#e74c3c;border:none;color:#fff;border-radius:6px;width:28px;height:28px;font-size:14px;font-weight:bold;cursor:pointer;';
          minus.onclick = () => stepTempStat(key, 'minus');
          btnBox.appendChild(minus);
        }
        if (_state.tempStatPoints > 0) {
          const plus = document.createElement('button');
          plus.textContent = '+';
          plus.style.cssText = 'background:var(--btn);border:none;color:#fff;border-radius:6px;width:28px;height:28px;font-size:14px;font-weight:bold;cursor:pointer;';
          plus.onclick = () => stepTempStat(key, 'plus');
          btnBox.appendChild(plus);
        }

        right.appendChild(btnBox);
        row.appendChild(left);
        row.appendChild(right);
        statsBody.appendChild(row);
      });

      const anyChanges = Object.values(_state.tempStatDistribution).some(v => v > 0);
      if (anyChanges) {
        const confirmBtn = document.createElement('button');
        confirmBtn.id = 'stat-save-btn';
        confirmBtn.className = 'battle-btn-finish';
        confirmBtn.style.cssText = 'margin-top:15px;width:100%;background:#2ecc71;border:none;color:#fff;padding:10px;font-weight:bold;border-radius:10px;cursor:pointer;';
        confirmBtn.textContent = '💾 Сохранить характеристики';
        confirmBtn.addEventListener('click', submitStatDistribution);
        statsBody.appendChild(confirmBtn);
      }

      // Кнопка сброса
      const resetsCount = p.stat_resets !== undefined ? p.stat_resets : 3;
      const resetBtn = document.createElement('button');
      resetBtn.style.cssText = 'margin-top:8px;width:100%;background:#e67e22;border:none;color:#fff;padding:10px;font-weight:bold;border-radius:10px;cursor:pointer;font-size:12px;';
      resetBtn.innerHTML = `🧹 Сбросить характеристики (Осталось: ${resetsCount})`;
      if (resetsCount <= 0) {
        resetBtn.style.background = '#333';
        resetBtn.style.color = '#666';
        resetBtn.disabled = true;
      }
      resetBtn.onclick = () => {
        const confirmReset = confirm(`⚠️ Вы уверены, что хотите сбросить все характеристики до 1? Это потратит 1 попытку сброса (Осталось: ${resetsCount}). Надетые вещи могут слететь!`);
        if (confirmReset) {
          resetBtn.disabled = true;
          resetBtn.textContent = '⏳ Сброс...';
          const s = getSocket();
          if (s && s.connected) {
            s.emit('request_stat_reset_secure', { userId: window.player.id });
          }
        }
      };
      statsBody.appendChild(resetBtn);
    }
    // Вкладка "Модификаторы"
    else {
      const totalAgi = Number(p.stats?.agility ?? p.agility ?? 1) + getEquipmentBonus(p, 'agility');
      const totalLuck = Number(p.stats?.luck ?? p.luck ?? 1) + getEquipmentBonus(p, 'luck');

      const mfInv = (totalAgi * 10) + getEquipmentBonus(p, 'mf_inv');
      const mfAntiInv = (totalAgi * 4) + getEquipmentBonus(p, 'mf_antiinv');
      const mfCrit = (totalLuck * 10) + getEquipmentBonus(p, 'mf_crit');
      const mfAntiCrit = (totalLuck * 4) + getEquipmentBonus(p, 'mf_anticrit');

      const finalEvade = Math.min(70, 5 + totalAgi);
      const finalCrit = Math.min(65, 5 + totalLuck);

      const mods = [
        { label: '🏹 Мф. Увертывания', value: mfInv + '%', sub: 'Реальный шанс боя: макс. ' + finalEvade + '%', desc: 'Шанс уклониться от физических атак' },
        { label: '🎯 Мф. Против увертывания', value: mfAntiInv + '%', sub: null, desc: 'Снижает уклонение соперника' },
        { label: '💥 Мф. Критического удара', value: mfCrit + '%', sub: 'Реальный шанс боя: макс. ' + finalCrit + '%', desc: 'Шанс нанести двойной урон' },
        { label: '🛡️ Мф. Против крита', value: mfAntiCrit + '%', sub: null, desc: 'Снижает шанс крита врага' }
      ];

      mods.forEach(m => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;flex-direction:column;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);';
        row.innerHTML =
          '<div style="display:flex;justify-content:space-between;font-weight:bold;">' +
            '<span>' + m.label + '</span>' +
            '<span style="color:#6c5ce7;font-size:16px;">+' + m.value + '</span>' +
          '</div>' +
          (m.sub ? '<div style="color:#f1c40f;font-size:11px;font-weight:600;margin-top:2px;">⚡ ' + m.sub + '</div>' : '') +
          '<div style="color:var(--hint);font-size:11px;margin-top:3px;line-height:1.2;">' + m.desc + '</div>';
        statsBody.appendChild(row);
      });
    }
  }

  function closeProfile() {
    const modal = document.getElementById('profile-modal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
  }

  function stepTempStat(statName, operation) {
    if (operation === 'plus') {
      if (_state.tempStatPoints <= 0) return;
      _state.tempStatDistribution[statName]++;
      _state.tempStatPoints--;
    } else if (operation === 'minus') {
      if (_state.tempStatDistribution[statName] <= 0) return;
      _state.tempStatDistribution[statName]--;
      _state.tempStatPoints++;
    }
    openProfile();
  }

function submitStatDistribution() {
  const s = getSocket();
  if (!s || !s.connected) return alert('⚠️ Нет соединения с сервером!');

  const btn = document.getElementById('stat-save-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Сохранение в облаке...';
  }

  // 🔥 Копия буфера — отправляем снимок
  const distribution = { ..._state.tempStatDistribution };

  s.emit('confirm_stat_distribution_secure', {
    userId: window.player.id,
    distribution: distribution
  });
}

  // ============================================================================
  // ИНВЕНТАРЬ
  // ============================================================================
  function openInventory() {
    const modal = document.getElementById('inventory-modal');
    if (modal) {
      modal.classList.add('active');
      modal.style.display = 'flex';
    }
    renderInventory();
  }

  function closeInventory() {
    const modal = document.getElementById('inventory-modal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
  }

  function switchTab(tabName) {
    _state.currentTab = tabName;
    document.querySelectorAll('.inv-tab').forEach(t => t.classList.remove('active'));
    const btn = document.querySelector(`.inv-tab[data-tab="${tabName}"]`);
    if (btn) btn.classList.add('active');
    renderInventory();
  }

  function hasInventorySpace(tabName, itemId) {
    if (!window.player || !window.player.inventory) return false;
    const items = window.player.inventory[tabName] || [];
    if (items.some(i => i.id === itemId)) return true;
    return items.length < 30;
  }

  function renderInventory() {
    if (!window.player) return;
    const p = window.player;

    const standardSlots = {
      head: '🪖', neck: '📿', gloves: '🧤', mainHand: '⚔️',
      body: '👕', legs: '🥾', extra: '✨', offHand: '🛡️'
    };

    // Проверка двуручника
    let isTwoHanded = false;
    const mh = p.equipped?.mainHand;
    const mhId = (mh && typeof mh === 'object') ? mh.id : mh;
    if (mhId) {
      const mhData = getItemData(mhId);
      if (mhData && (mhData.slotType === 'twoHanded' || mhId.includes('halberd') || mhId.includes('claymore') || mhId.includes('broadsword') || mhId.includes('splitter'))) {
        isTwoHanded = true;
      }
    }

    // 8 основных слотов
    Object.keys(standardSlots).forEach(slotKey => {
      const el = document.getElementById('eslot-' + slotKey);
      if (!el) return;

      if (slotKey === 'offHand' && isTwoHanded) {
        el.textContent = '❌';
        el.style.background = 'rgba(231, 76, 60, 0.15)';
        el.style.border = '1px solid var(--danger)';
        el.style.fontSize = '18px';
        return;
      }

      const raw = p.equipped?.[slotKey];
      const itemId = (raw && typeof raw === 'object') ? raw.id : raw;
      if (itemId) {
        const d = getItemData(itemId);
        if (d) {
          el.textContent = d.icon || '📦';
          el.style.background = '#222f3e';
          el.style.border = '2px solid var(--btn)';
          el.style.fontSize = '22px';
          return;
        }
      }
      el.textContent = standardSlots[slotKey];
      el.style.background = 'rgba(255, 255, 255, 0.03)';
      el.style.border = '1px dashed rgba(255, 255, 255, 0.25)';
      el.style.fontSize = '18px';
    });

    // Кольца
    for (let i = 0; i < 3; i++) {
      const el = document.getElementById('eslot-ring-' + i);
      if (!el) continue;
      const raw = p.equipped?.rings?.[i];
      const itemId = (raw && typeof raw === 'object') ? raw.id : raw;
      if (itemId) {
        const d = getItemData(itemId);
        if (d) {
          el.textContent = d.icon || '💍';
          el.style.background = '#222f3e';
          el.style.border = '2px solid var(--btn)';
          continue;
        }
      }
      el.textContent = '💍';
      el.style.background = 'rgba(255, 255, 255, 0.03)';
      el.style.border = '1px dashed rgba(255, 255, 255, 0.25)';
    }

    // Зелье / свиток
    ['potion', 'scroll'].forEach(slotKey => {
      const el = document.getElementById('eslot-' + slotKey);
      if (!el) return;
      const raw = p.equipped?.[slotKey];
      const itemId = (raw && typeof raw === 'object') ? raw.id : raw;
      const count = (raw && typeof raw === 'object') ? raw.count : 1;

      if (itemId) {
        const d = getItemData(itemId);
        if (d) {
          el.innerHTML = (d.icon || '🧪') + '<span style="position:absolute;bottom:2px;right:4px;font-size:10px;font-weight:bold;background:rgba(0,0,0,0.7);padding:1px 3px;border-radius:4px;color:#2ecc71;">x' + count + '</span>';
          el.style.background = '#222f3e';
          el.style.border = '2px solid #2ecc71';
          el.style.position = 'relative';
          return;
        }
      }
      el.innerHTML = slotKey === 'potion' ? '🧪' : '📜';
      el.style.background = 'rgba(255, 255, 255, 0.03)';
      el.style.border = '1px dashed rgba(255, 255, 255, 0.25)';
    });

    // Аватар
        const avatar = document.getElementById('inv-hero-avatar');
        if (avatar) {
        avatar.src = window.getAssetPath ? window.getAssetPath(p.avatar || 'assets/avatars/hero1.png') : (p.avatar || '../assets/avatars/hero1.png');
        }

    // Сетка
    const container = document.getElementById('inventory-content');
    if (!container) return;
    container.innerHTML = '';

    const items = p.inventory?.[_state.currentTab] || [];

    const counter = document.createElement('div');
    counter.style.cssText = 'width:100%;grid-column:1/-1;padding:4px 8px;margin-bottom:6px;font-size:12px;font-weight:bold;color:var(--hint);display:flex;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.05);';
    const titles = { equipment: '⚔️ Снаряжение', resources: '💎 Материалы', consumables: '🧪 Расходники' };
    counter.innerHTML = '<span>' + (titles[_state.currentTab] || '') + '</span><span>Занято: ' + items.length + ' / 30</span>';
    container.appendChild(counter);

    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'grid-column:1/-1;text-align:center;color:var(--hint);font-size:13px;padding:20px 0;';
      empty.textContent = 'Здесь пока пусто...';
      container.appendChild(empty);
      return;
    }

    items.forEach(item => {
      const itemId = item.id || item;
      const d = getItemData(itemId);
      if (!d) {
        console.warn(`⚠️ Предмет с ID "${itemId}" не найден`);
        return;
      }

      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      slot.style.cssText = 'width:46px;height:46px;position:relative;font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:8px;background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.08);';

      if (d.icon && (d.icon.includes('.') || d.icon.includes('/'))) {
        slot.innerHTML = '<img src="' + d.icon + '" style="width:32px;height:32px;object-fit:contain;">';
      } else {
        slot.textContent = d.icon || '📦';
      }

      // Требования (подсветка)
      const myStr = Number(p.stats?.strength || 1);
      const myAgi = Number(p.stats?.agility || 1);
      const myEnd = Number(p.stats?.endurance || 1);
      const myLuck = Number(p.stats?.luck || 1);

      let hasStats = true;
      if (d.req?.strength && myStr < d.req.strength) hasStats = false;
      if (d.req?.agility && myAgi < d.req.agility) hasStats = false;
      if (d.req?.endurance && myEnd < d.req.endurance) hasStats = false;
      if (d.req?.luck && myLuck < d.req.luck) hasStats = false;
      const levelOk = d.level ? (p.level >= d.level) : true;

      if (!hasStats || !levelOk) {
        slot.style.backgroundColor = 'rgba(231, 76, 60, 0.18)';
        slot.style.border = '1px solid rgba(231, 76, 60, 0.4)';
      }

      // Уровень
      if (d.level) {
        const lvl = document.createElement('span');
        lvl.style.cssText = 'position:absolute;top:2px;left:4px;font-size:9px;font-weight:bold;color:#f1c40f;';
        lvl.textContent = 'L.' + d.level;
        slot.appendChild(lvl);
      }

      // Иконка стата
      let statBadge = '';
      if (d.req?.strength) statBadge = '💪';
      else if (d.req?.agility) statBadge = '🏹';
      else if (d.req?.endurance) statBadge = '🛡️';
      else if (d.req?.luck) statBadge = '🍀';
      if (statBadge) {
        const sb = document.createElement('span');
        sb.style.cssText = 'position:absolute;top:2px;right:4px;font-size:10px;';
        sb.textContent = statBadge;
        slot.appendChild(sb);
      }

      // Стак
      if (item.count > 1) {
        const cnt = document.createElement('span');
        cnt.className = 'inv-count';
        cnt.textContent = item.count;
        slot.appendChild(cnt);
      }

      slot.onclick = () => showItemInfo(item.uuid || item.id || item, { context: 'inventory', isEquipped: false });
      container.appendChild(slot);
    });
  }

  // ============================================================================
  // ПОПОВЕР ПРЕДМЕТА (УНИВЕРСАЛЬНЫЙ)
  // ============================================================================
  function showItemInfo(itemUuidOrId, options = {}) {
    const { context = 'inventory', isEquipped = false, slotKey = null, ringIndex = null } = options;
    if (!itemUuidOrId || !window.player) return;

    // Извлекаем чистый ID
    let cleanId = itemUuidOrId;
    if (itemUuidOrId.includes('_') && !window.GAME_ITEMS_DATABASE?.[itemUuidOrId]) {
      const parts = itemUuidOrId.split('_');
      if (parts.length > 2) cleanId = parts.slice(0, -2).join('_');
    }

    const itemData = getItemData(cleanId);
    if (!itemData) return;

    const popover = document.getElementById('item-info-popover');
    const pName = document.getElementById('popover-item-name');
    const pIcon = document.getElementById('popover-item-icon');
    const pDesc = document.getElementById('popover-item-desc');
    const pBtn = document.getElementById('popover-item-action-btn');
    if (!popover || !pName || !pIcon || !pDesc || !pBtn) return;

    pName.textContent = itemData.name;
    pIcon.textContent = itemData.icon || '📦';

    // Собираем описание
    let text = itemData.desc || '';
    text += '\n';

    // Требования
    const p = window.player;
    const pStats = p.stats || {};
    if (itemData.level) {
      const ok = p.level >= itemData.level;
      text += (ok ? '✅' : '🔒') + ' Требуется уровень: ' + itemData.level + '\n';
    }
    if (itemData.req) {
      if (itemData.req.strength) text += ((pStats.strength || 1) >= itemData.req.strength ? '✅' : '🔒') + ' Сила: ' + itemData.req.strength + '\n';
      if (itemData.req.agility) text += ((pStats.agility || 1) >= itemData.req.agility ? '✅' : '🔒') + ' Ловкость: ' + itemData.req.agility + '\n';
      if (itemData.req.endurance) text += ((pStats.endurance || 1) >= itemData.req.endurance ? '✅' : '🔒') + ' Выносливость: ' + itemData.req.endurance + '\n';
      if (itemData.req.luck) text += ((pStats.luck || 1) >= itemData.req.luck ? '✅' : '🔒') + ' Удача: ' + itemData.req.luck + '\n';
    }

 // Бонусы
    if (itemData.bonus) {
      text += '\n⭐ Бонусы:\n';
      const b = itemData.bonus;

      // 🔥 Атака — с диапазоном
      if (b.atkMin !== undefined && b.atkMax !== undefined) {
        text += '⚔️ Атака: +' + b.atkMin + '-' + b.atkMax + '\n';
      } else if (b.atk) {
        text += '⚔️ Атака: +' + b.atk + '\n';
      }

      // 🔥 Защита — с диапазоном (на будущее)
      if (b.defMin !== undefined && b.defMax !== undefined) {
        text += '🛡️ Защита: +' + b.defMin + '-' + b.defMax + '\n';
      } else if (b.def) {
        text += '🛡️ Защита: +' + b.def + '\n';
      }

      if (b.mf_crit) text += '💥 Крит: +' + b.mf_crit + '%\n';
      if (b.mf_inv) text += '🏹 Уворот: +' + b.mf_inv + '%\n';
      if (b.mf_antiinv) text += '🎯 Антиуворот: +' + b.mf_antiinv + '%\n';
      if (b.mf_anticrit) text += '🛡️ Антикрит: +' + b.mf_anticrit + '%\n';
      if (b.stats) {
        if (b.stats.strength) text += '💪 +' + b.stats.strength + ' Сила\n';
        if (b.stats.agility) text += '🏹 +' + b.stats.agility + ' Ловкость\n';
        if (b.stats.endurance) text += '🛡️ +' + b.stats.endurance + ' Выносливость\n';
        if (b.stats.luck) text += '🍀 +' + b.stats.luck + ' Удача\n';
      }
    }

    pDesc.textContent = text;

    // Контекст: РЕСУРС
    if (itemData.slotType === 'resource') {
      pBtn.textContent = '📦 Ресурс (не экипируется)';
      pBtn.style.background = '#555';
      pBtn.disabled = true;
      pBtn.onclick = null;
      popover.style.display = 'flex';
      return;
    }

    // Контекст: МАГАЗИН — только описание, без кнопок
    if (context === 'shop') {
      pBtn.style.display = 'none';
      popover.style.display = 'flex';
      return;
    }

    // Контекст: ИНВЕНТАРЬ
    pBtn.style.display = 'block';

    if (isEquipped) {
      // Кнопка СНЯТЬ
      pBtn.textContent = '❌ Снять';
      pBtn.style.background = '#e74c3c';
      pBtn.disabled = false;
      pBtn.onclick = () => {
        popover.style.display = 'none';
        const s = getSocket();
        if (!s || !s.connected) return alert('⚠️ Нет соединения');
        s.emit('unequip_item_secure', {
          userId: window.player.id,
          slotKey: slotKey,
          ringIndex: (ringIndex !== undefined && ringIndex !== null) ? ringIndex : null
        });
      };
    } else {
      // Кнопка ЭКИПИРОВАТЬ
      pBtn.textContent = '🛡️ Экипировать';
      pBtn.style.background = '#6c5ce7';
      pBtn.disabled = false;
      pBtn.onclick = () => {
        popover.style.display = 'none';
        const s = getSocket();
        if (!s || !s.connected) return alert('⚠️ Нет соединения');
        s.emit('equip_item_secure', { userId: window.player.id, itemId: itemUuidOrId });
      };
    }

    popover.style.display = 'flex';
  }

  // ============================================================================
  // ПРИВЯЗКА СОБЫТИЙ (клики по слотам, вкладкам, модалкам)
  // ============================================================================
  function bindEvents() {
    // Закрытие модалок по клику на фон/крестик
    document.addEventListener('click', (e) => {
      const closeTarget = e.target.closest('[data-ui-close]');
      if (closeTarget) {
        const type = closeTarget.getAttribute('data-ui-close');
        if (type === 'profile') closeProfile();
        else if (type === 'inventory') closeInventory();
        else if (type === 'popover') {
          const p = document.getElementById('item-info-popover');
          if (p) p.style.display = 'none';
        }
        return;
      }

      // Клик по фону модалки
      if (e.target.id === 'profile-modal') closeProfile();
      if (e.target.id === 'inventory-modal') closeInventory();
    });

    // Кнопка рюкзака (шапка города / карты)
    const invToggle = document.getElementById('inventory-toggle-btn');
    if (invToggle && !invToggle.__uiBound) {
      invToggle.__uiBound = true;
      invToggle.addEventListener('click', openInventory);
    }

    // Кнопка мира (🎒 на карте)
    const worldInvBtn = document.getElementById('world-inventory-btn');
    if (worldInvBtn && !worldInvBtn.__uiBound) {
      worldInvBtn.__uiBound = true;
      worldInvBtn.addEventListener('click', openInventory);
    }

    // Аватарка (профиль)
    const avatarSlot = document.getElementById('player-avatar-slot');
    if (avatarSlot && !avatarSlot.__uiBound) {
      avatarSlot.__uiBound = true;
      avatarSlot.addEventListener('click', openProfile);
    }

    const worldAvatar = document.getElementById('world-avatar-slot');
    if (worldAvatar && !worldAvatar.__uiBound) {
      worldAvatar.__uiBound = true;
      worldAvatar.addEventListener('click', openProfile);
    }

    // Вкладки инвентаря
    document.querySelectorAll('.inv-tab').forEach(tab => {
      if (tab.__uiBound) return;
      tab.__uiBound = true;
      tab.addEventListener('click', () => {
        const t = tab.getAttribute('data-tab');
        if (t) switchTab(t);
      });
    });

    // Клик по слотам куклы
    const equipSlots = ['head', 'neck', 'gloves', 'mainHand', 'body', 'legs', 'extra', 'offHand'];
    equipSlots.forEach(slotKey => {
      const el = document.getElementById('eslot-' + slotKey);
      if (!el || el.__uiBound) return;
      el.__uiBound = true;
      el.addEventListener('click', () => {
        const raw = window.player?.equipped?.[slotKey];
        const itemId = (raw && typeof raw === 'object') ? raw.id : raw;
        if (itemId) showItemInfo(itemId, { context: 'inventory', isEquipped: true, slotKey });
      });
    });

    // Кольца
    for (let i = 0; i < 3; i++) {
      const el = document.getElementById('eslot-ring-' + i);
      if (!el || el.__uiBound) return;
      el.__uiBound = true;
      el.addEventListener('click', () => {
        const raw = window.player?.equipped?.rings?.[i];
        const itemId = (raw && typeof raw === 'object') ? raw.id : raw;
        if (itemId) showItemInfo(itemId, { context: 'inventory', isEquipped: true, slotKey: 'ring', ringIndex: i });
      });
    }

        // Зелье / свиток
        ['potion', 'scroll'].forEach(slotKey => {
        const el = document.getElementById('eslot-' + slotKey);
        if (!el || el.__uiBound) return;   // ✅ return вместо continue
        el.__uiBound = true;
        el.addEventListener('click', () => {
            const raw = window.player?.equipped?.[slotKey];
            const itemId = (raw && typeof raw === 'object') ? raw.id : raw;
            if (itemId) showItemInfo(itemId, { context: 'inventory', isEquipped: true, slotKey });
        });
        });
  }

  // ============================================================================
  // ПУБЛИЧНЫЙ API
  // ============================================================================
  window.UI = {
    // Профиль
    openProfile,
    closeProfile,
    stepTempStat,
    submitStatDistribution,

    // Инвентарь
    openInventory,
    closeInventory,
    switchTab,
    renderInventory,
    hasInventorySpace,

    // Поповер
    showItemInfo,

    // Хелперы
    getItemData,
    getEquipmentBonus,
    getMaxHp,
    getAtk,
    getAtkRange,           // 🔥 НОВОЕ
    getDef,

    // Инициализация
    init() {
      if (_state.initDone) return;
      _state.initDone = true;
      injectModals();
      bindEvents();
      console.log('✅ [UI] Инициализация завершена');
    }
  };

  // Автоматическая инициализация
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.UI.init());
  } else {
    window.UI.init();
  }

})();