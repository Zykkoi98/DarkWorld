// ============================================================================
// ===== 🛡️ МОДУЛЬ УПРАВЛЕНИЯ СНАРЯЖЕНИЕМ ПЕРСОНАЖА (EQUIPMENT LOGIC) =====
// ============================================================================

/**
 * ФУНКЦИЯ НАДЕВАНИЯ ПРЕДМЕТА ИЗ РЮКЗАКА
 * @param {string} itemId - Уникальный идентификатор предмета (например, 'iron_sword')
 */
window.equipItem = function(itemId) {
  if (!window.player) return;

  // Извлекаем чистый ID предмета для проверки требований уровня
  let cleanItemId = itemId;
  if (itemId && itemId.includes('_')) {
    const parts = itemId.split('_');
    if (parts.length > 2) cleanItemId = parts.slice(0, -2).join('_');
  }

  const itemData = window.getItemData(cleanItemId);
  if (!itemData) return;

  // 🔒 Быстрая проверка уровня на клиенте (чтобы разгрузить сеть)
  const requiredLevel = itemData.level || 1;
  if (window.player.level < requiredLevel) {
    alert(`🔒 Этот предмет требует ${requiredLevel}-й уровень! Ваш текущий уровень: ${window.player.level}.`);
    return;
  }

  // 🔥 УЛЬТИМАТИВНЫЙ ФИКС БАГА: Больше никакой локальной unequipItem!
  // Просто делегируем всю математику и генерацию UUID надежному бэкенду.
  if (window.socket && window.socket.connected) {
    console.log(`📡 Отправка запроса на безопасную экипировку: ${itemId}`);
    window.socket.emit('equip_item_secure', {
      userId: window.player.id,
      itemId: itemId
    });
  } else if (window.saveGame) {
    // Резервный оффлайн-режим (если используется локально)
    let slotType = itemData.slotType || 'mainHand';
    if (slotType === 'twoHanded') slotType = 'mainHand';
    window.player.equipped[slotType] = cleanItemId;
    window.saveGame({ player: window.player });
    if (window.renderInventory) window.renderInventory();
    if (window.render) window.render();
  }
};


/**
 * ФУНКЦИЯ СНЯТИЯ ПРЕДМЕТА С КУКЛЫ ПЕРСОНАЖА ОБРАТНО В РЮКЗАК
 * @param {string} slotKey - Название слота ('head', 'body', 'mainHand', 'ring' и т.д.)
 * @param {number} [ringIndex] - Индекс кольца (0, 1 или 2), если снимаем кольцо
 */
window.unequipItem = function(slotKey, ringIndex = null) {
  if (!window.player) return;

  let equippedData = null;
  if (slotKey === 'ring' && ringIndex !== null) {
    equippedData = window.player.equipped.rings[ringIndex];
  } else {
    equippedData = window.player.equipped[slotKey];
  }

  if (!equippedData) return;

  const invTab = (slotKey === 'potion' || slotKey === 'scroll') ? 'consumables' : 'equipment';
  const inv = window.player.inventory[invTab];

  let itemId = (typeof equippedData === 'object') ? equippedData.id : equippedData;
  let countToReturn = (typeof equippedData === 'object') ? equippedData.count : 1;

  if (window.hasInventorySpace && !window.hasInventorySpace(invTab, itemId)) {
    alert("⚠️ Сумка переполнена!");
    return;
  }

  const existingItem = inv.find(i => i.id === itemId);
  if (existingItem) {
    existingItem.count = (existingItem.count || 1) + countToReturn;
  } else {
    const itemData = window.getItemData(itemId);
    if (itemData) {
      inv.push({ id: itemId, name: itemData.name, icon: itemData.icon, count: countToReturn, desc: itemData.desc });
    }
  }

  if (slotKey === 'ring' && ringIndex !== null) {
    window.player.equipped.rings[ringIndex] = null;
  } else {
    window.player.equipped[slotKey] = null;
  }

  if (window.saveGame) window.saveGame({ player: window.player });
  if (window.renderInventory) window.renderInventory();
  if (window.render) window.render();
};