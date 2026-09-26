// ============================================================================
// ===== 🌐 ГЛОБАЛЬНЫЙ ПЕРЕХВАТЧИК РЕДИРЕКТА В БОЙ (GLOBAL_BATTLE_WATCH.JS) =====
// ===== Подключается на ВСЕХ страницах: город, магазин, башня, арена =====
// ============================================================================
(function() {
  // Защита от повторной загрузки
  if (window.__globalBattleWatchLoaded) return;
  window.__globalBattleWatchLoaded = true;

  console.log("🌐 [GLOBAL WATCH] Активирован глобальный перехватчик боя");

  // Функция экстренного ухода в бой
  function forceRedirectToBattle(roomId) {
    if (!roomId) return;
    
    console.log(`⚔️ [GLOBAL WATCH] Принудительный редирект в бой: ${roomId}`);
    
    // 1. Закрываем iframe Арены, если открыт
    const wrapper = document.getElementById('arena-iframe-wrapper');
    const frame = document.getElementById('arena-iframe-frame');
    if (wrapper) wrapper.style.display = 'none';
    if (frame) frame.src = 'about:blank';

    // 2. Закрываем любые модалки поверх (если игрок был в профиле/инвентаре)
    document.querySelectorAll('.modal-overlay').forEach(m => {
      m.classList.remove('active');
      m.style.display = 'none';
    });

    // 3. Определяем правильный путь до battle.html
    // (в index.html это battle/battle.html, в shop/shop.html это ../battle/battle.html)
    const currentPath = window.location.pathname;
    const inSubfolder = currentPath.includes('/shop/') 
                     || currentPath.includes('/tower/') 
                     || currentPath.includes('/battle/');
    
    const battlePath = inSubfolder ? '../battle/battle.html' : 'battle/battle.html';
    
    // 4. Мгновенный редирект
    window.location.replace(`${battlePath}?roomId=${roomId}`);
  }

  // Экспортируем в глобальный объект — доступно с любой страницы
  window.forceRedirectToBattle = forceRedirectToBattle;

  // Попытка привязаться к родительскому сокету (если мы в iframe)
  function tryBindToParentSocket() {
    const parentWin = window.parent;
    
    // Случай 1: Мы внутри iframe города (arena.html внутри index.html)
    if (parentWin && parentWin !== window && parentWin.socket) {
      console.log("🔗 [GLOBAL WATCH] Подписываемся на сокет родителя (iframe)");
      parentWin.socket.on('arena_redirect_to_battle', (data) => {
        if (data && data.roomId) {
          forceRedirectToBattle(data.roomId);
        }
      });
      return true;
    }
    return false;
  }

  // Случай 2: Мы на отдельной странице (shop.html, tower.html)
  // — ждём, когда локальный сокет будет создан страницей, и вешаем слушатель
  let attempts = 0;
  const waitForSocket = setInterval(() => {
    attempts++;

    // Если сокет уже есть у родителя — привязываемся
    if (tryBindToParentSocket()) {
      clearInterval(waitForSocket);
      return;
    }

    // Если это самостоятельная страница — ищем свой сокет
    // (shop_client.js / tower_client.js создают window.shopSocket / towerSocket)
    const localSocket = window.shopSocket || window.towerSocket || window.socket;
    
    if (localSocket && localSocket.connected) {
      console.log("🔗 [GLOBAL WATCH] Подписываемся на локальный сокет страницы");
      
      // Снимаем старый обработчик, чтобы не было дублей
      localSocket.off('arena_redirect_to_battle');
      
      localSocket.on('arena_redirect_to_battle', (data) => {
        if (data && data.roomId) {
          forceRedirectToBattle(data.roomId);
        }
      });
      
      // Дополнительно: проверяем при возврате фокуса на вкладку
      // (на случай, если игрок сидел с фоном)
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && localSocket.connected) {
          localSocket.emit('check_active_battle', { 
            userId: (window.player && window.player.id) 
                 || (localSocket.userId) 
                 || 0 
          });
        }
      });
      
      clearInterval(waitForSocket);
      return;
    }

    // Даём 10 секунд на создание сокета
    if (attempts > 100) { 
      console.warn("⚠️ [GLOBAL WATCH] Не удалось найти сокет за 10 секунд");
      clearInterval(waitForSocket); 
    }
  }, 100);

  // Также слушаем сообщения от iframe (на случай, если редирект придёт через postMessage)
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'FORCE_BATTLE_REDIRECT' && event.data.roomId) {
      forceRedirectToBattle(event.data.roomId);
    }
  });

})();