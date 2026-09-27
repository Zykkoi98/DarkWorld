// ============================================================================
// ===== 🌐 ГЛОБАЛЬНЫЙ ПЕРЕХВАТЧИК РЕДИРЕКТА В БОЙ (GLOBAL_BATTLE_WATCH.JS) =====
// ===== Подключается на ВСЕХ страницах: город, магазин, башня, арена =====
// ============================================================================
(function() {
  // Защита от повторной загрузки
  if (window.__globalBattleWatchLoaded) {
    console.log("🌐 [GLOBAL WATCH] Уже загружен, пропускаем повторную инициализацию");
    return;
  }
  window.__globalBattleWatchLoaded = true;

  console.log("🌐 [GLOBAL WATCH] Активирован глобальный перехватчик боя");

  // ============================================================================
  // ФУНКЦИЯ ЭКСТРЕННОГО УХОДА В БОЙ
  // ============================================================================
  function forceRedirectToBattle(roomId) {
    if (!roomId) return;
    
    console.log(`⚔️ [GLOBAL WATCH] Принудительный редирект в бой: ${roomId}`);
    
    // 1. Закрываем iframe Арены, если открыт
    const wrapper = document.getElementById('arena-iframe-wrapper');
    const frame = document.getElementById('arena-iframe-frame');
    if (wrapper) wrapper.style.display = 'none';
    if (frame) frame.src = 'about:blank';

    // 2. Закрываем любые модалки поверх
    document.querySelectorAll('.modal-overlay').forEach(m => {
      m.classList.remove('active');
      m.style.display = 'none';
    });

    // 3. Определяем правильный путь до battle.html
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

  // ============================================================================
  // 🔥 ИМЕНОВАННЫЙ ОБРАБОТЧИК (чтобы снимать ТОЛЬКО свой, не задевая telegram.js)
  // ============================================================================
  const onArenaRedirect = (data) => {
    if (data && data.roomId) {
      forceRedirectToBattle(data.roomId);
    }
  };

  // ============================================================================
  // ПРИВЯЗКА К РОДИТЕЛЬСКОМУ СОКЕТУ (если мы в iframe города)
  // ============================================================================
  function tryBindToParentSocket() {
    const parentWin = window.parent;
    
    if (parentWin && parentWin !== window && parentWin.socket) {
      console.log("🔗 [GLOBAL WATCH] Подписываемся на сокет родителя (iframe)");
      
      // 🔥 Снимаем ТОЛЬКО свой прошлый обработчик (если был)
      parentWin.socket.off('arena_redirect_to_battle', onArenaRedirect);
      parentWin.socket.on('arena_redirect_to_battle', onArenaRedirect);
      
      return true;
    }
    return false;
  }

  // ============================================================================
  // ОЖИДАНИЕ ЛОКАЛЬНОГО СОКЕТА (для shop.html, tower.html)
  // ============================================================================
  let attempts = 0;
  const waitForSocket = setInterval(() => {
    attempts++;

    // Если сокет уже есть у родителя — привязываемся
    if (tryBindToParentSocket()) {
      clearInterval(waitForSocket);
      return;
    }

    // Ищем локальный сокет страницы
    const localSocket = window.shopSocket || window.towerSocket || window.socket;
    
    if (localSocket && localSocket.connected) {
      console.log("🔗 [GLOBAL WATCH] Подписываемся на локальный сокет страницы");
      
      // 🔥 Снимаем ТОЛЬКО свой прошлый обработчик — не трогаем чужие!
      localSocket.off('arena_redirect_to_battle', onArenaRedirect);
      localSocket.on('arena_redirect_to_battle', onArenaRedirect);
      
      // 🔥 ФИКС УТЕЧКИ: снимаем старый visibilitychange, если был
      if (window.__globalBattleVisibilityHandler) {
        document.removeEventListener('visibilitychange', window.__globalBattleVisibilityHandler);
        console.log("🧹 [GLOBAL WATCH] Снят старый visibilitychange handler");
      }

      // Создаём новый обработчик с актуальной ссылкой на localSocket
      window.__globalBattleVisibilityHandler = () => {
        if (!document.hidden && localSocket.connected) {
          localSocket.emit('check_active_battle', { 
            userId: (window.player && window.player.id) 
                 || (localSocket.userId) 
                 || 0 
          });
        }
      };

      document.addEventListener('visibilitychange', window.__globalBattleVisibilityHandler);
      
      clearInterval(waitForSocket);
      return;
    }

    // Даём 10 секунд на создание сокета
    if (attempts > 100) { 
      console.warn("⚠️ [GLOBAL WATCH] Не удалось найти сокет за 10 секунд");
      clearInterval(waitForSocket); 
    }
  }, 100);

  // ============================================================================
  // СЛУШАТЕЛЬ ПОСТ-СООБЩЕНИЙ (на случай, если редирект придёт через postMessage)
  // ============================================================================
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'FORCE_BATTLE_REDIRECT' && event.data.roomId) {
      forceRedirectToBattle(event.data.roomId);
    }
  });

})();