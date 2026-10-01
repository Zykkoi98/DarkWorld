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

    // 🔥 ФИКС 404: определяем корень проекта (папка DarkWorld) и строим путь от него
    // Это работает в любом окружении: GitHub Pages, localhost, iframe, прямая ссылка
      const currentPath = window.location.pathname;

      // Ищем корень проекта: до первой известной подпапки (shop/tower/battle) или до конца
      let projectRoot;
      if (currentPath.includes('/shop/')) {
        projectRoot = currentPath.split('/shop/')[0];
      } else if (currentPath.includes('/tower/')) {
        projectRoot = currentPath.split('/tower/')[0];
      } else if (currentPath.includes('/battle/')) {
        projectRoot = currentPath.split('/battle/')[0];
      } else if (currentPath.includes('/arena/')) {
        projectRoot = currentPath.split('/arena/')[0];     // ← НОВОЕ
      } else {
        // Мы в корне (index.html)
        projectRoot = currentPath.replace(/\/[^/]*$/, '');
      }

      // projectRoot для GitHub Pages = /DarkWorld (или '' если репо в корне домена)
      // 🔥 Достаём userId из localStorage / Telegram
  let userId = null;
  try {
    const tg = window.Telegram?.WebApp?.initDataUnsafe?.user;
    if (tg?.id) userId = tg.id;
  } catch(e) {}
  if (!userId) {
    try {
      const ls = localStorage.getItem('rpg_save');
      if (ls) userId = JSON.parse(ls)?.player?.id;
    } catch(e) {}
  }

const battleUrl = `${projectRoot}/battle/battle.html?roomId=${roomId}${userId ? `&userId=${userId}` : ''}`;

    console.log(`🌐 [GLOBAL WATCH] Абсолютный путь до боя: ${battleUrl}`);
    window.location.replace(battleUrl);
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
            localSocket.emit('battle_check_active', { 
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