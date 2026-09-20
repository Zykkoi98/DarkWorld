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

  let slotType = itemData.slotType;
  if (!slotType) {
    if (itemData.heal || itemId.includes('potion') || itemId.includes('soup')) slotType = 'potion';
    if (itemData.duration || itemId.includes('scroll')) slotType = 'scroll';
  }

  if (!slotType) {
    alert("❌ Этот предмет нельзя экипировать на куклу!");
    return;
  }
  
  const requiredLevel = itemData.level || 1;
  if (window.player.level < requiredLevel) {
    alert(`🔒 Требуется уровень: ${requiredLevel}`);
    return;
  }

  const invTab = (slotType === 'potion' || slotType === 'scroll') ? 'consumables' : 'equipment';
  const inv = window.player.inventory[invTab];
  const itemIdx = inv.findIndex(i => i.id === itemId);
  
  if (itemIdx === -1) return;

  // --- ЛОГИКА ДЛЯ РАСХОДНИКОВ (БАНКИ И СВИТКИ) С УМНЫМ ДОБОРОМ ДО 5 ШТ ---
  if (slotType === 'potion' || slotType === 'scroll') {
    const currentEquipped = window.player.equipped[slotType];
    const availableInInv = inv[itemIdx].count || 1;

    let alreadyEquippedCount = 0;

    if (currentEquipped && typeof currentEquipped === 'object' && currentEquipped.id) {
      if (currentEquipped.id === itemId) {
        alreadyEquippedCount = currentEquipped.count;
        if (alreadyEquippedCount >= 5) {
          alert("🎒 В этот слот уже взят максимальный стак (5 шт.)!");
          return;
        }
      } else {
        window.unequipItem(slotType);
      }
    }

    const spaceLeft = 5 - alreadyEquippedCount; 
    const countToEquip = Math.min(spaceLeft, availableInInv);

    window.player.equipped[slotType] = {
      id: itemId,
      count: alreadyEquippedCount + countToEquip
    };

    if (availableInInv > countToEquip) {
      inv[itemIdx].count -= countToEquip;
    } else {
      inv.splice(itemIdx, 1);
    }

    if (window.saveGame) window.saveGame({ player: window.player });
    if (window.renderInventory) window.renderInventory();
    if (window.render) window.render();
    return;
  }

  // --- ОБЫЧНАЯ ЛОГИКА ОРУЖИЯ И БРОНИ ---
  let targetSlot = slotType;
  if (slotType === 'ring') {
    let ringIndex = window.player.equipped.rings.findIndex(r => r === null);
    if (ringIndex === -1) { ringIndex = 0; window.unequipItem('ring', 0); }
    targetSlot = `ring-${ringIndex}`;
  }

  if (slotType === 'twoHanded') {
    if (window.player.equipped.offHand) window.unequipItem('offHand');
    targetSlot = 'mainHand'; 
  }

  if (slotType === 'offHand' && window.player.equipped.mainHand) {
    const mainHandItem = window.getItemData(window.player.equipped.mainHand);
    if (mainHandItem && mainHandItem.slotType === 'twoHanded') {
      alert("⚠️ Нельзя взять щит, пока в руках двуручное оружие!");
      return;
    }
  }

  if (slotType !== 'ring' && window.player.equipped[targetSlot]) {
    window.unequipItem(targetSlot);
  }

  if (inv[itemIdx].count > 1) { inv[itemIdx].count--; } else { inv.splice(itemIdx, 1); }

  if (slotType === 'ring') {
    const ringIdx = parseInt(targetSlot.split('-')[1]);
    window.player.equipped.rings[ringIdx] = itemId;
  } else {
    window.player.equipped[targetSlot] = itemId;
  }

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