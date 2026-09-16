// ============================================================================
// ===== 🛡️ МОДУЛЬ УПРАВЛЕНИЯ СНАРЯЖЕНИЕМ ПЕРСОНАЖА (EQUIPMENT LOGIC) =====
// ============================================================================

/**
 * ФУНКЦИЯ НАДЕВАНИЯ ПРЕДМЕТА ИЗ РЮКЗАКА
 * @param {string} itemId - Уникальный идентификатор предмета (например, 'iron_sword')
 */
window.equipItem = function(itemId) {
  if (!window.player) return;

  const itemData = window.getItemData(itemId);
  if (!itemData) return;

  // 1. Автоматически определяем тип слота для банок и свитков
  let slotType = itemData.slotType;
  if (!slotType) {
    if (itemData.heal || itemId.includes('potion') || itemId.includes('soup')) slotType = 'potion';
    if (itemData.duration || itemId.includes('scroll')) slotType = 'scroll';
  }

  if (!slotType) {
    alert("❌ Этот предмет нельзя экипировать на куклу!");
    return;
  }
  
  // Жесткая проверка уровня героя
  const requiredLevel = itemData.level || 1;
  if (window.player.level < requiredLevel) {
    alert(`🔒 Требуется уровень: ${requiredLevel}`);
    return;
  }

  // 🔥 ИСПРАВЛЕНИЕ: Сначала находим точный индекс предмета, который МЫ КЛИКНУЛИ в рюкзаке
  const invTab = (slotType === 'potion' || slotType === 'scroll') ? 'consumables' : 'equipment';
  const inv = window.player.inventory[invTab];
  const itemIdx = inv.findIndex(i => i.id === itemId);
  
  if (itemIdx === -1) {
    console.error("❌ Предмет не найден в рюкзаке!");
    return; // Если предмета физически нет в рюкзаке, выходим
  }

  let targetSlot = slotType;

  // 2. Логика для колец: ищем свободный слот или заменяем первое кольцо
  if (slotType === 'ring') {
    let ringIndex = window.player.equipped.rings.findIndex(r => r === null);
    if (ringIndex === -1) {
      ringIndex = 0;
      window.unequipItem('ring', 0);
    }
    targetSlot = `ring-${ringIndex}`;
  }

  // 3. Проверка на двуручное оружие и щиты
  if (slotType === 'twoHanded') {
    if (window.player.equipped.offHand) {
      window.unequipItem('offHand');
    }
    targetSlot = 'mainHand'; 
  }

  if (slotType === 'offHand') {
    if (window.player.equipped.mainHand) {
      const mainHandItem = window.getItemData(window.player.equipped.mainHand);
      if (mainHandItem && mainHandItem.slotType === 'twoHanded') {
        alert("⚠️ Нельзя взять щит, пока в руках двуручное оружие! Сначала снимите его.");
        return;
      }
    }
  }

  // 4. Если в целевом слоте уже что-то надето — снимаем это в рюкзак.
  // Так как мы УЖЕ знаем индекс `itemIdx` нужного меча, возврат старого меча 
  // в конец массива инвентаря никак не повлияет на списание.
  if (slotType !== 'ring') {
    if (window.player.equipped[targetSlot]) {
      window.unequipItem(targetSlot);
    }
  }

  // 🔥 ИСПРАВЛЕНИЕ: Списываем предмет строго по ранее найденному индексу
  if (inv[itemIdx].count > 1) {
    inv[itemIdx].count--;
  } else {
    inv.splice(itemIdx, 1);
  }

  // 5. Помещаем на куклу персонажа
  if (slotType === 'ring') {
    const ringIdx = parseInt(targetSlot.split('-')[1]);
    window.player.equipped.rings[ringIdx] = itemId;
  } else {
    window.player.equipped[targetSlot] = itemId;
  }

  // 6. Синхронизируем данные и обновляем экраны
  if (window.saveGame) window.saveGame({ player: window.player });
  if (window.renderInventory) window.renderInventory();
  if (window.render) window.render();
};

/**
 * ФУНКЦИЯ СНЯТИЯ ПРЕДМЕТА С КУКЛЫ ПЕРСОНАЖА ОБРАТНО В РЮКЗАК
 * @param {string} slotKey - Название слота ('head', 'body', 'mainHand', 'ring' и т.д.)
 * @param {number} [ringIndex] - Индекс кольца (0, 1 или 2), если снимаем кольцо
 */
window.unequipItem = function(slotKey, ringIndex = null) {
  if (!window.player) return;

  let itemId = null;
  if (slotKey === 'ring' && ringIndex !== null) {
    itemId = window.player.equipped.rings[ringIndex];
  } else {
    itemId = window.player.equipped[slotKey];
  }

  if (!itemId) return;

  // 🔥 Определяем вкладку возврата
  const invTab = (slotKey === 'potion' || slotKey === 'scroll') ? 'consumables' : 'equipment';

  if (window.hasInventorySpace && !window.hasInventorySpace(invTab, itemId)) {
    alert("⚠️ Сумка переполнена!");
    return;
  }

  const inv = window.player.inventory[invTab];
  const existingItem = inv.find(i => i.id === itemId);

  if (existingItem) {
    existingItem.count = (existingItem.count || 1) + 1;
  } else {
    const itemData = window.getItemData(itemId);
    if (itemData) {
      inv.push({ id: itemId, name: itemData.name, icon: itemData.icon, count: 1, desc: itemData.desc });
    }
  }

  // Очищаем куклу
  if (slotKey === 'ring' && ringIndex !== null) {
    window.player.equipped.rings[ringIndex] = null;
  } else {
    window.player.equipped[slotKey] = null;
  }

  if (window.saveGame) window.saveGame({ player: window.player });
  if (window.renderInventory) window.renderInventory();
  if (window.render) window.render();
};