// ============================================================================
// ===== 🛒 МОДУЛЬ МАГАЗИНА (ЧАСТЬ 1: ИНТЕРФЕЙС И СОБЫТИЯ) =====
// ============================================================================

window._currentShopCategory = null; // Текущая открытая категория

/**
 * ГЛОБАЛЬНАЯ ФУНКЦИЯ ОТКРЫТИЯ МАГАЗИНА
 * Подгружает HTML-шаблон витрины торговца через fetch
 */
window.openShop = function() {
  const modal = document.getElementById('shop-modal');
  if (!modal) return;

  fetch('shop_template.html')
    .then(res => res.text())
    .then(htmlText => {
      modal.innerHTML = htmlText;
      
      // Обновляем кошелек игрока в лавке
      document.getElementById('shop-player-gold').textContent = window.player.gold;

      // Инициализируем события кликов
      initShopEvents();

      // Показываем модальное окно
      modal.classList.add('active');
      modal.style.display = 'flex';
    })
    .catch(() => alert('❌ Ошибка загрузки интерфейса магазина.'));
};

/**
 * ЗАКРЫТИЕ ОКНА МАГАЗИНА
 */
window.closeShop = function() {
  const modal = document.getElementById('shop-modal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
};

/**
 * ИНИЦИАЛИЗАЦИЯ КЛИКОВ CSP ВНУТРИ МАГАЗИНА
 */
function initShopEvents() {
  document.getElementById('shop-close-btn')?.addEventListener('click', window.closeShop);
  document.getElementById('shop-back-btn')?.addEventListener('click', showCategoriesPage);

  document.getElementById('shop-modal')?.addEventListener('click', function(e) {
    if (e.target.id === 'shop-modal') window.closeShop();
  });

  const catButtons = document.querySelectorAll('[data-shop-cat]');
  catButtons.forEach(btn => {
    btn.addEventListener('click', function() {
      const category = btn.getAttribute('data-shop-cat');
      openShopCategory(category);
    });
  });
}

/**
 * ВОЗВРАТ НА ГЛАВНУЮ СТРАНИЦУ КАТЕГОРИЙ (УРОВЕНЬ 1)
 */
function showCategoriesPage() {
  document.getElementById('shop-categories-page').style.display = 'flex';
  document.getElementById('shop-items-page').style.display = 'none';
  document.getElementById('shop-back-btn').style.display = 'none';
  document.getElementById('shop-title').textContent = '🛒 Лавка торговца';
  window._currentShopCategory = null;
}

/**
 * ПЕРЕХОД НА СТРАНИЦУ ТОВАРОВ ВЫБРАННОЙ КАТЕГОРИИ (УРОВЕНЬ 2)
 */
function openShopCategory(category) {
  window._currentShopCategory = category;
  
  const catPage = document.getElementById('shop-categories-page');
  const itemsPage = document.getElementById('shop-items-page');
  const backBtn = document.getElementById('shop-back-btn');
  const title = document.getElementById('shop-title');

  catPage.style.display = 'none';
  itemsPage.style.display = 'flex';
  backBtn.style.display = 'block';

  if (category === 'weapon') title.textContent = '🗡️ Кузнец: Оружие';
  if (category === 'armor') title.textContent = '👕 Броня и Доспехи';
  if (category === 'jewelry') title.textContent = '💍 Ювелир: Бижутерия';
  if (category === 'consumables') title.textContent = '🧪 Алхимик: Зелья';

  // Вызываем функцию рендеринга из Части 2
  window.renderShopItems(category);
}
// ============================================================================
// ===== 🛒 МОДУЛЬ МАГАЗИНА (ЧАСТЬ 2: РЕНДЕРИНГ УРОВНЕЙ И ПОКУПКА) =====
// ============================================================================

// Глобальный массив для хранения ID раскрытых в данный момент уровней в магазине
window._expandedShopLevels = []; 

/**
 * ДИНАМИЧЕСКИЙ РЕНДЕРИНГ СТРОК ТОВАРОВ С РАЗБИВКОЙ ПО РАСКРЫВАЕМЫМ УРОВНЯМ
 */
window.renderShopItems = function(category) {
  const container = document.getElementById('shop-items-page');
  if (!container) return;
  container.innerHTML = '';
  container.style.cssText = 'display: flex; flex-direction: column; width: 100%; max-height: 60vh; overflow-y: auto; padding-right: 4px;';

  const dbKey = (category === 'consumables') ? 'consumables' : 'equipment';
  const shopItems = window.SHOP_DATABASE[dbKey] || [];

  // 1. Фильтруем товары по вкладкам категории
  const filteredItems = shopItems.filter(shopItem => {
    const itemData = window.getItemData(shopItem.id);
    if (!itemData) return false;
    
    if (category === 'weapon') return itemData.slotType === 'mainHand' || itemData.slotType === 'offHand' || itemData.slotType === 'twoHanded';
    if (category === 'armor') return itemData.slotType === 'head' || itemData.slotType === 'body' || itemData.slotType === 'legs' || itemData.slotType === 'gloves';
    if (category === 'jewelry') return itemData.slotType === 'neck' || itemData.slotType === 'ring';
    return true; 
  });

  if (filteredItems.length === 0) {
    container.innerHTML = '<div style="text-align:center; color:var(--hint); padding:20px;">У торговца кончился товар...</div>';
    return;
  }

  // 2. Группируем предметы по уровням
  const groupedByLevel = {};
  filteredItems.forEach(shopItem => {
    const itemData = window.getItemData(shopItem.id);
    if (!itemData) return;

    const itemLevel = itemData.level || 1;

    if (!groupedByLevel[itemLevel]) groupedByLevel[itemLevel] = [];
    groupedByLevel[itemLevel].push({ shopItem, itemData });
  });

  // 3. Выводим списки уровней
  const sortedLevels = Object.keys(groupedByLevel).sort((a, b) => Number(a) - Number(b));
  
  sortedLevels.forEach(level => {
    const itemsInLevel = groupedByLevel[level];
    const isLocked = window.player.level < Number(level);
    
    const levelGroupWrapper = document.createElement('div');
    levelGroupWrapper.style.cssText = 'display: flex; flex-direction: column; width: 100%; margin-bottom: 8px;';

    const levelHeader = document.createElement('button');
    levelHeader.style.cssText = `
      padding: 10px 12px;
      margin: 4px 0;
      font-size: 13px;
      font-weight: bold;
      border-radius: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: ${isLocked ? 'rgba(231, 76, 60, 0.12)' : 'rgba(108, 92, 231, 0.12)'};
      border: 1px solid ${isLocked ? 'rgba(231, 76, 60, 0.2)' : 'rgba(108, 92, 231, 0.2)'};
      border-left: 4px solid ${isLocked ? 'var(--danger)' : 'var(--btn)'};
      color: ${isLocked ? '#ff7675' : '#a29bfe'};
      cursor: pointer;
      width: 100%;
      text-align: left;
    `;
    
    const isExpanded = window._expandedShopLevels.includes(`${category}-${level}`);
    const arrowEmoji = isExpanded ? '🔼' : '🔽';
    
    levelHeader.innerHTML = `
      <span>📋 Предметы ${level} уровня ${arrowEmoji}</span>
      <span>${isLocked ? `🔒 Требуется ур. ${level}` : '✅ Доступно'}</span>
    `;

    const itemsContainer = document.createElement('div');
    itemsContainer.style.cssText = 'display: flex; flex-direction: column; width: 100%; gap: 6px; padding: 4px 0;';
    
    if (!isExpanded) {
      itemsContainer.style.display = 'none';
    }

    levelHeader.addEventListener('click', function() {
      const levelKey = `${category}-${level}`;
      if (window._expandedShopLevels.includes(levelKey)) {
        window._expandedShopLevels = window._expandedShopLevels.filter(k => k !== levelKey);
      } else {
        window._expandedShopLevels.push(levelKey);
      }
      window.renderShopItems(category);
    });

    levelGroupWrapper.appendChild(levelHeader);

    // 4. Генерируем карточки товаров
    itemsInLevel.forEach(({ shopItem, itemData }) => {
      const row = document.createElement('div');
      row.className = 'card';
      row.style.cssText = 'display: flex; gap: 12px; align-items: center; padding: 10px; margin: 0; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; width: 100%;';
      if (isLocked) row.style.opacity = '0.5';

      const iconSlot = document.createElement('div');
      iconSlot.style.cssText = 'width: 60px; height: 60px; min-width: 60px; border-radius: 10px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 26px;';
      iconSlot.textContent = itemData.icon;
      row.appendChild(iconSlot);

      const infoBlock = document.createElement('div');
      infoBlock.style.cssText = 'display: flex; flex-direction: column; flex: 1; gap: 4px;';

      const titleRow = document.createElement('div');
      titleRow.style.cssText = 'font-weight: bold; font-size: 14px; color: #fff;';
      titleRow.textContent = itemData.name;
      infoBlock.appendChild(titleRow);

      const descRow = document.createElement('div');
      descRow.style.cssText = 'font-size: 11px; color: var(--hint); line-height: 1.3;';
      let bonusText = '';
      if (itemData.bonus) {
        if (itemData.bonus.atk) bonusText += ` [⚔️ +${itemData.bonus.atk} Атка]`;
        if (itemData.bonus.def) bonusText += ` [🛡️ +${itemData.bonus.def} Защита]`;
      }
      descRow.textContent = (itemData.desc || '') + bonusText;
      infoBlock.appendChild(descRow);

      const buyBtn = document.createElement('button');
      buyBtn.className = 'loc-btn';
      buyBtn.style.cssText = 'padding: 6px 12px; font-size: 11px; font-weight: bold; background: var(--btn); border: none; border-radius: 6px; width: auto; align-self: flex-start; margin-top: 4px; flex-direction: row; gap: 4px; cursor: pointer;';
      
      if (isLocked) {
        buyBtn.innerHTML = `🔒 Нужен лвл ${level}`;
        buyBtn.style.background = '#57606f';
        buyBtn.disabled = true;
      } else {
        buyBtn.innerHTML = `Купить за ${shopItem.price} 💰`;
        buyBtn.addEventListener('click', function() { buyItem(shopItem.id, shopItem.price, category); });
      }

      infoBlock.appendChild(buyBtn);
      row.appendChild(infoBlock);
      itemsContainer.appendChild(row);
    });

    levelGroupWrapper.appendChild(itemsContainer);
    container.appendChild(levelGroupWrapper);
  });
};

/**
 * БЕЗОПАСНАЯ ПОКУПКА С ОКНОМ ПОДТВЕРЖДЕНИЯ
 */
function buyItem(itemId, price, category) {
  if (!window.player) return;

  const itemData = window.getItemData(itemId);
  if (!itemData) return;

  // 🔥 НОВЫЙ ШАГ: Модальное окно подтверждения покупки
  const isConfirmed = confirm(`Вы действительно хотите купить ${itemData.icon} "${itemData.name}" за ${price} 💰?`);
  if (!isConfirmed) {
    return; // Если игрок нажал "Отмена", прерываем функцию и ничего не покупаем
  }

  // Проверяем баланс золота
  if (window.player.gold < price) {
    alert("❌ Недостаточно золота!");
    return;
  }

  const invTab = (category === 'consumables') ? 'consumables' : 'equipment';
  if (window.hasInventorySpace && !window.hasInventorySpace(invTab, itemId)) {
    alert("⚠️ Сумка переполнена!");
    return;
  }

  // Списание средств
  window.player.gold -= price;
  document.getElementById('shop-player-gold').textContent = window.player.gold;

  const inv = window.player.inventory[invTab];
  const existingItem = inv.find(i => i.id === itemId);

  if (existingItem) {
    existingItem.count = (existingItem.count || 1) + 1;
  } else {
    inv.push({ id: itemId, name: itemData.name, icon: itemData.icon, count: 1, desc: itemData.desc });
  }

  alert(`🛒 Успешно куплено: ${itemData.name}!`);
  if (window.saveGame) window.saveGame({ player: window.player });
  if (window.render) window.render(); 
}