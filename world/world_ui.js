// ============================================================================
// ===== 🎒 ЛОКАЛЬНЫЙ UI КАРТЫ МИРА (WORLD_UI.JS) =====
// ===== Профиль + Инвентарь БЕЗ зависимости от game.js =====
// ============================================================================

window.__worldCurrentTab = 'equipment';
window.__worldProfileTab = 'main';
window.__worldTempStatDistribution = { strength: 0, agility: 0, endurance: 0, luck: 0 };
window.__worldTempStatPoints = 0;

// ============================================================================
// ХЕЛПЕРЫ
// ============================================================================
function worldGetEquipmentBonus(bonusKey) {
  if (!window.player || !window.player.equipped) return 0;
  let total = 0;
  const slots = ['head', 'body', 'legs', 'gloves', 'neck', 'mainHand', 'offHand', 'extra'];

  slots.forEach(slot => {
    const itemId = window.player.equipped[slot];
    if (!itemId) return;
    const itemData = window.getItemData ? window.getItemData(itemId) : null;
    if (itemData?.bonus) {
      if (itemData.bonus[bonusKey] !== undefined) total += itemData.bonus[bonusKey];
      if (itemData.bonus.stats && itemData.bonus.stats[bonusKey] !== undefined) total += itemData.bonus.stats[bonusKey];
    }
  });

  if (window.player.equipped.rings && Array.isArray(window.player.equipped.rings)) {
    window.player.equipped.rings.forEach(itemId => {
      if (!itemId) return;
      const itemData = window.getItemData ? window.getItemData(itemId) : null;
      if (itemData?.bonus) {
        if (itemData.bonus[bonusKey] !== undefined) total += itemData.bonus[bonusKey];
        if (itemData.bonus.stats && itemData.bonus.stats[bonusKey] !== undefined) total += itemData.bonus.stats[bonusKey];
      }
    });
  }
  return total;
}

function worldGetMaxHp() {
  if (!window.player) return 10;
  const baseEnd = Number(window.player.stats?.endurance || window.player.endurance || 1);
  return ((baseEnd + worldGetEquipmentBonus('endurance')) * 10) + worldGetEquipmentBonus('hp');
}

function worldGetAtk() {
  if (!window.player) return 0;
  const str = Number(window.player.stats?.strength || window.player.strength || 1);
  return Math.floor(2 + ((str + worldGetEquipmentBonus('strength')) * 1.5)) + worldGetEquipmentBonus('atk');
}

function worldGetDef() {
  if (!window.player) return 0;
  const end = Number(window.player.stats?.endurance || window.player.endurance || 1);
  return Math.floor((end + worldGetEquipmentBonus('endurance')) * 0.5) + worldGetEquipmentBonus('def');
}

// ============================================================================
// 🪟 ПРОФИЛЬ
// ============================================================================
window.openProfile = function() {
  const modal = document.getElementById('profile-modal');
  const body = document.getElementById('world-profile-body');
  if (!modal || !body || !window.player) return;

  window.__worldTempStatDistribution = { strength: 0, agility: 0, endurance: 0, luck: 0 };
  window.__worldTempStatPoints = window.player.statPoints || 0;

  body.innerHTML = '';
  const p = window.player;

  const rows = [
    { label: '💰 Золото', value: (p.gold || 0) + ' монет' },
    { label: '❤️ Здоровье', value: (p.hp || 0) + ' / ' + worldGetMaxHp() },
    { label: '⚔️ Атака', value: worldGetAtk() },
    { label: '🛡️ Защита', value: worldGetDef() + ' ед.' }
  ];

  rows.forEach(r => {
    const row = document.createElement('div');
    row.className = 'profile-row';
    row.innerHTML = `<span>${r.label}</span><span>${r.value}</span>`;
    body.appendChild(row);
  });

  const hr = document.createElement('hr');
  hr.style.cssText = 'border:0; border-top:1px solid rgba(255,255,255,0.1); margin:12px 0;';
  body.appendChild(hr);

  const tabs = document.createElement('div');
  tabs.style.cssText = 'display:flex; gap:8px; margin-bottom:15px; justify-content:center;';

  const btnMain = document.createElement('button');
  btnMain.textContent = '📊 Основные';
  btnMain.style.cssText = 'flex:1; padding:8px; border-radius:8px; border:none; font-weight:bold; cursor:pointer; background:' + (window.__worldProfileTab !== 'modifiers' ? 'var(--btn)' : 'rgba(255,255,255,0.05)') + '; color:' + (window.__worldProfileTab !== 'modifiers' ? '#fff' : 'var(--hint)') + ';';
  btnMain.onclick = () => { window.__worldProfileTab = 'main'; window.openProfile(); };

  const btnMods = document.createElement('button');
  btnMods.textContent = '💥 Модификаторы';
  btnMods.style.cssText = 'flex:1; padding:8px; border-radius:8px; border:none; font-weight:bold; cursor:pointer; background:' + (window.__worldProfileTab === 'modifiers' ? 'var(--btn)' : 'rgba(255,255,255,0.05)') + '; color:' + (window.__worldProfileTab === 'modifiers' ? '#fff' : 'var(--hint)') + ';';
  btnMods.onclick = () => { window.__worldProfileTab = 'modifiers'; window.openProfile(); };

  tabs.appendChild(btnMain);
  tabs.appendChild(btnMods);
  body.appendChild(tabs);

  if (window.__worldProfileTab !== 'modifiers') {
    const pointsDiv = document.createElement('div');
    pointsDiv.style.cssText = 'margin:5px 0 10px 0; font-weight:bold; font-size:16px; color:#f1c40f; text-align:center;';
    pointsDiv.textContent = 'Доступно очков: ' + window.__worldTempStatPoints;
    body.appendChild(pointsDiv);

    const labels = { strength: '💪 Сила', agility: '🏹 Ловкость', endurance: '🛡️ Выносливость', luck: '🍀 Удача' };

    ['strength', 'agility', 'endurance', 'luck'].forEach(key => {
      const row = document.createElement('div');
      row.className = 'profile-row';

      const baseVal = Number(p.stats?.[key] ?? p[key] ?? 1);
      const gearBonus = worldGetEquipmentBonus(key);
      const tempAdded = window.__worldTempStatDistribution[key];
      const totalVal = baseVal + gearBonus + tempAdded;

      let html = '<strong style="color:#fff; font-size:15px;">' + totalVal + '</strong> ';
      if (tempAdded > 0) html += '<span style="color:#a29bfe; font-size:12px;">(+' + tempAdded + ')</span> ';
      html += '<span style="color:var(--hint); font-size:12px;">(' + baseVal + ')</span>';
      if (gearBonus > 0) html += ' <span style="color:#2ecc71; font-size:12px;">(+' + gearBonus + ')</span>';

      const left = document.createElement('span');
      left.textContent = labels[key];

      const right = document.createElement('span');
      right.style.cssText = 'display:flex; align-items:center; gap:4px;';
      right.innerHTML = '<span style="margin-right:8px;">' + html + '</span>';

      if (tempAdded > 0) {
        const minus = document.createElement('button');
        minus.textContent = '-';
        minus.style.cssText = 'background:#e74c3c; border:none; color:#fff; border-radius:6px; width:28px; height:28px; font-size:14px; font-weight:bold; cursor:pointer;';
        minus.onclick = () => { window.__worldTempStatDistribution[key]--; window.__worldTempStatPoints++; window.openProfile(); };
        right.appendChild(minus);
      }
      if (window.__worldTempStatPoints > 0) {
        const plus = document.createElement('button');
        plus.textContent = '+';
        plus.style.cssText = 'background:var(--btn); border:none; color:#fff; border-radius:6px; width:28px; height:28px; font-size:14px; font-weight:bold; cursor:pointer;';
        plus.onclick = () => { window.__worldTempStatDistribution[key]++; window.__worldTempStatPoints--; window.openProfile(); };
        right.appendChild(plus);
      }

      row.appendChild(left);
      row.appendChild(right);
      body.appendChild(row);
    });

    const anyChanges = Object.values(window.__worldTempStatDistribution).some(v => v > 0);
    if (anyChanges) {
      const saveBtn = document.createElement('button');
      saveBtn.style.cssText = 'margin-top:15px; width:100%; background:#2ecc71; border:none; color:#fff; padding:10px; font-weight:bold; border-radius:10px; cursor:pointer;';
      saveBtn.textContent = '💾 Сохранить характеристики';
      saveBtn.onclick = () => {
        if (window.worldSocket && window.worldSocket.connected && window.player) {
          window.worldSocket.emit('confirm_stat_distribution_secure', {
            userId: window.player.id,
            distribution: window.__worldTempStatDistribution
          });
          saveBtn.disabled = true;
          saveBtn.textContent = '⏳ Сохранение...';
          setTimeout(() => window.openProfile(), 1500);
        } else {
          alert('⚠️ Нет соединения с сервером');
        }
      };
      body.appendChild(saveBtn);
    }
  } else {
    const totalAgi = Number(p.stats?.agility ?? p.agility ?? 1) + worldGetEquipmentBonus('agility');
    const totalLuck = Number(p.stats?.luck ?? p.luck ?? 1) + worldGetEquipmentBonus('luck');

    const mfInv = (totalAgi * 10) + worldGetEquipmentBonus('mf_inv');
    const mfAntiInv = (totalAgi * 4) + worldGetEquipmentBonus('mf_antiinv');
    const mfCrit = (totalLuck * 10) + worldGetEquipmentBonus('mf_crit');
    const mfAntiCrit = (totalLuck * 4) + worldGetEquipmentBonus('mf_anticrit');

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
      row.style.cssText = 'display:flex; flex-direction:column; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.05);';
      row.innerHTML =
        '<div style="display:flex; justify-content:space-between; font-weight:bold;">' +
        '<span>' + m.label + '</span>' +
        '<span style="color:#6c5ce7; font-size:16px;">+' + m.value + '</span>' +
        '</div>' +
        (m.sub ? '<div style="color:#f1c40f; font-size:11px; font-weight:600; margin-top:2px;">⚡ ' + m.sub + '</div>' : '') +
        '<div style="color:var(--hint); font-size:11px; margin-top:3px; line-height:1.2;">' + m.desc + '</div>';
      body.appendChild(row);
    });
  }

  modal.classList.add('active');
  modal.style.display = 'flex';
};

window.closeProfile = function() {
  const modal = document.getElementById('profile-modal');
  if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
};

// ============================================================================
// 🎒 ИНВЕНТАРЬ
// ============================================================================
window.openInventory = function() {
  const modal = document.getElementById('inventory-modal');
  if (modal) { modal.classList.add('active'); modal.style.display = 'flex'; }
  window.renderWorldInventory();
};

window.closeInventory = function() {
  const modal = document.getElementById('inventory-modal');
  if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
};

window.switchWorldTab = function(tabName) {
  window.__worldCurrentTab = tabName;
  document.querySelectorAll('.inv-tab').forEach(t => t.classList.remove('active'));
  const btn = document.getElementById('tab-btn-' + tabName);
  if (btn) btn.classList.add('active');
  window.renderWorldInventory();
};

window.renderWorldInventory = function() {
  if (!window.player) return;
  const p = window.player;

  const standardSlots = {
    head: '🪖', neck: '📿', gloves: '🧤', mainHand: '⚔️',
    body: '👕', legs: '🥾', extra: '✨', offHand: '🛡️'
  };

  Object.keys(standardSlots).forEach(slotKey => {
    const el = document.getElementById('eslot-' + slotKey);
    if (!el) return;
    const itemId = p.equipped?.[slotKey];
    if (itemId) {
      const itemData = window.getItemData ? window.getItemData(itemId) : null;
      if (itemData) {
        el.textContent = itemData.icon || '📦';
        el.style.background = '#222f3e';
        el.style.border = '2px solid var(--btn)';
        el.style.fontSize = '22px';
      }
    } else {
      el.textContent = standardSlots[slotKey];
      el.style.background = 'rgba(255, 255, 255, 0.03)';
      el.style.border = '1px dashed rgba(255, 255, 255, 0.25)';
      el.style.fontSize = '18px';
    }
  });

  for (let i = 0; i < 3; i++) {
    const el = document.getElementById('eslot-ring-' + i);
    if (!el) continue;
    const ringId = p.equipped?.rings?.[i];
    if (ringId) {
      const itemData = window.getItemData ? window.getItemData(ringId) : null;
      if (itemData) {
        el.textContent = itemData.icon || '💍';
        el.style.background = '#222f3e';
        el.style.border = '2px solid var(--btn)';
      }
    } else {
      el.textContent = '💍';
      el.style.background = 'rgba(255, 255, 255, 0.03)';
      el.style.border = '1px dashed rgba(255, 255, 255, 0.25)';
    }
  }

  ['potion', 'scroll'].forEach(slotKey => {
    const el = document.getElementById('eslot-' + slotKey);
    if (!el) return;
    const equippedData = p.equipped?.[slotKey];
    if (equippedData && typeof equippedData === 'object' && equippedData.id) {
      const itemData = window.getItemData ? window.getItemData(equippedData.id) : null;
      if (itemData) {
        el.innerHTML = (itemData.icon || '🧪') + '<span style="position:absolute; bottom:2px; right:4px; font-size:10px; font-weight:bold; background:rgba(0,0,0,0.7); padding:1px 3px; border-radius:4px; color:#2ecc71;">x' + equippedData.count + '</span>';
        el.style.background = '#222f3e';
        el.style.border = '2px solid #2ecc71';
        el.style.position = 'relative';
      }
    } else {
      el.innerHTML = slotKey === 'potion' ? '🧪' : '📜';
      el.style.background = 'rgba(255, 255, 255, 0.03)';
      el.style.border = '1px dashed rgba(255, 255, 255, 0.25)';
    }
  });

  const avatar = document.getElementById('inv-hero-avatar');
  if (avatar) avatar.src = p.avatar || '../assets/avatars/hero1.png';

  const container = document.getElementById('inventory-content');
  if (!container) return;
  container.innerHTML = '';

  const tab = window.__worldCurrentTab || 'equipment';
  const items = p.inventory?.[tab] || [];

  const counter = document.createElement('div');
  counter.style.cssText = 'width:100%; grid-column: 1 / -1; padding:4px 8px; margin-bottom:6px; font-size:12px; font-weight:bold; color:var(--hint); display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.05);';
  const titles = { equipment: '⚔️ Снаряжение', resources: '💎 Материалы', consumables: '🧪 Расходники' };
  counter.innerHTML = '<span>' + (titles[tab] || '') + '</span><span>Занято: ' + items.length + ' / 30</span>';
  container.appendChild(counter);

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'grid-column: 1 / -1; text-align:center; color:var(--hint); font-size:13px; padding:20px 0;';
    empty.textContent = 'Здесь пока пусто...';
    container.appendChild(empty);
    return;
  }

  items.forEach(item => {
    const itemId = item.id || item;
    const fullData = window.getItemData ? window.getItemData(itemId) : null;
    if (!fullData) return;

    const slot = document.createElement('div');
    slot.className = 'inv-slot';
    slot.style.cssText = 'width:46px; height:46px; position:relative; font-size:22px; cursor:pointer; display:flex; align-items:center; justify-content:center; border-radius:8px; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.08);';

    if (fullData.icon && (fullData.icon.includes('.') || fullData.icon.includes('/'))) {
      slot.innerHTML = '<img src="' + fullData.icon + '" style="width:32px; height:32px; object-fit:contain;">';
    } else {
      slot.textContent = fullData.icon || '📦';
    }

    if (fullData.level) {
      const lvl = document.createElement('span');
      lvl.style.cssText = 'position:absolute; top:2px; left:4px; font-size:9px; font-weight:bold; color:#f1c40f;';
      lvl.textContent = 'L.' + fullData.level;
      slot.appendChild(lvl);
    }

    if (item.count > 1) {
      const cnt = document.createElement('span');
      cnt.style.cssText = 'position:absolute; bottom:2px; right:4px; font-size:10px; font-weight:bold; background:rgba(0,0,0,0.7); padding:1px 3px; border-radius:4px;';
      cnt.textContent = item.count;
      slot.appendChild(cnt);
    }

    slot.onclick = () => window.showWorldItemInfo(item.uuid || item.id || item);
    container.appendChild(slot);
  });
};

// ============================================================================
// 🪟 ПОПОВЕР ПРЕДМЕТА
// ============================================================================
window.showWorldItemInfo = function(itemUuidOrId) {
  if (!itemUuidOrId || !window.player) return;

  let cleanId = itemUuidOrId;
  if (itemUuidOrId.includes('_') && !window.GAME_ITEMS_DATABASE?.[itemUuidOrId]) {
    const parts = itemUuidOrId.split('_');
    if (parts.length > 2) cleanId = parts.slice(0, -2).join('_');
  }

  const itemData = window.getItemData ? window.getItemData(cleanId) : null;
  if (!itemData) return;

  const popover = document.getElementById('item-info-popover');
  const pName = document.getElementById('popover-item-name');
  const pIcon = document.getElementById('popover-item-icon');
  const pDesc = document.getElementById('popover-item-desc');
  const pBtn = document.getElementById('popover-item-action-btn');
  if (!popover || !pName || !pIcon || !pDesc || !pBtn) return;

  pName.textContent = itemData.name;
  pIcon.textContent = itemData.icon || '📦';

  let text = itemData.desc || '';
  text += '\n';

  if (itemData.level) {
    const ok = window.player.level >= itemData.level;
    text += (ok ? '✅' : '🔒') + ' Требуется уровень: ' + itemData.level + '\n';
  }

  const pStats = window.player.stats || {};
  if (itemData.req) {
    if (itemData.req.strength) text += ((pStats.strength || 1) >= itemData.req.strength ? '✅' : '🔒') + ' Сила: ' + itemData.req.strength + '\n';
    if (itemData.req.agility) text += ((pStats.agility || 1) >= itemData.req.agility ? '✅' : '🔒') + ' Ловкость: ' + itemData.req.agility + '\n';
    if (itemData.req.endurance) text += ((pStats.endurance || 1) >= itemData.req.endurance ? '✅' : '🔒') + ' Выносливость: ' + itemData.req.endurance + '\n';
    if (itemData.req.luck) text += ((pStats.luck || 1) >= itemData.req.luck ? '✅' : '🔒') + ' Удача: ' + itemData.req.luck + '\n';
  }

  if (itemData.bonus) {
    text += '\n⭐ Бонусы:\n';
    const b = itemData.bonus;
    if (b.atk) text += '⚔️ Атака: +' + b.atk + '\n';
    if (b.def) text += '🛡️ Защита: +' + b.def + '\n';
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

  pBtn.textContent = '🛡️ Экипировать';
  pBtn.style.background = '#6c5ce7';
  pBtn.onclick = () => {
    popover.style.display = 'none';
    if (window.worldSocket && window.worldSocket.connected) {
      window.worldSocket.emit('equip_item_secure', { userId: window.player.id, itemId: itemUuidOrId });
    } else {
      alert('⚠️ Нет соединения');
    }
  };

  popover.style.display = 'flex';
};

// ============================================================================
// ПРИВЯЗКА КНОПОК
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.inv-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      if (tab) window.switchWorldTab(tab);
    });
  });

  const slotKeys = ['head', 'neck', 'gloves', 'mainHand', 'body', 'legs', 'extra', 'offHand'];
  slotKeys.forEach(slotKey => {
    const el = document.getElementById('eslot-' + slotKey);
    if (el) {
      el.addEventListener('click', () => {
        const itemId = window.player?.equipped?.[slotKey];
        if (itemId) window.showWorldItemInfo(itemId);
      });
    }
  });
});