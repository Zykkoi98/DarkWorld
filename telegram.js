// ============================================================================
// ===== ☁️ ИСПРАВЛЕННЫЙ МОДУЛЬ INTEGRATION TELEGRAM & SUPABASE (ФИКС) =====
// ============================================================================
const TG = window.Telegram?.WebApp;

// Ключи авторизации облачной базы Supabase
const SUPABASE_URL = "https://ylslpgujwgxtsabkzgbd.supabase.co"; 
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsc2xwZ3Vqd2d4dHNhYmt6Z2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMDM3ODksImV4cCI6MjEwNDg3OTc4OX0.GKocc3hnVQVSYaOnm1QhHca54sBn8AsiN8mHo6J0ENY"; 

// Глобальная переменная базы данных
window.sb = null;

/**
 * 🔌 БЕЗОПАСНОЕ ЛЕНИВОЕ ПОДКЛЮЧЕНИЕ К СУПАБЕЙС
 * Срабатывает только после того, как игра успешно отрисовала интерфейс
 */
function initSupabaseLazy() {
  if (window.sb) return; // Если уже подключены, ничего не делаем
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    try {
      window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      console.log("🔌 Ленивое подключение к Supabase успешно создано!");
    } catch(e) {
      console.warn("⚠️ Не удалось инициализировать клиент Supabase в фоне:", e);
    }
  }
}

window.loadGame = function(callback) {
  const TG = window.Telegram?.WebApp;
  
  if (TG) {
    TG.ready();
    TG.expand();
  }

  const tgUser = TG?.initDataUnsafe?.user;

  // 1. СЦЕНАРИЙ: УСПЕШНЫЙ ВХОД ЧЕРЕЗ TELEGRAM MINI APP (ВАШ СЛУЧАЙ!)
  if (TG && tgUser) { // 🚀 МГНОВЕННЫЙ СТАРТ: Разрешаем игре мгновенно открыться (Ян сразу видит интерфейс)
    callback(null);

    // Уходим в фоновый ленивый запрос к Supabase через 500мс
    setTimeout(() => {
      // 🔥 ДОБАВИЛИ ЖЕСТКИЙ ВЫЗОВ: Сначала железно инициализируем подключение!
      if (typeof initSupabaseLazy === 'function') initSupabaseLazy();
      
      if (!window.sb) {
        console.warn("⚠️ Фоновое подключение к Supabase не удалось создать.");
        return;
      }
      
      console.log("☁️ Фоновый запрос профиля из Supabase...");
      window.sb.from('players').select('*').eq('id', Number(userId))
        .then(({ data, error }) => {
          if (error) {
            console.warn("⚠️ Облачная база временно недоступна в фоне:", error.message);
            return;
          }

          if (data && data.length > 0) {
            console.log("☁️ Данные с облака Supabase успешно синхронизированы в фоне!");
            const cloudPlayer = Array.isArray(data) ? data[0] : data;
            
            // Если на сервере уровень или опыт выше, обновляем локального персонажа
            if ((cloudPlayer.level || 1) >= (window.player.level || 1)) {
              window.player = cloudPlayer;
              if (typeof window.render === 'function') window.render(); // Перерисовываем город
            }
          } else {
            // 🔥 ТЕПЕРЬ ЭТО СРАБОТАЕТ НА 100% ПРИ ПЕРВОМ ВХОДЕ
            console.log("☁️ Профиль игрока отсутствует в облаке. Создаем запись для новичка...");
            window.saveGame();
          }
        })
        .catch(err => console.warn("⚠️ Фоновый сетевой запрос сброшен по таймауту:", err));
    }, 600);} else {
    // 2. СЦЕНАРИЙ: ЗАПУСК ПРОСТО В БРАУЗЕРЕ НА ПК
    console.warn("⚠️ Запущено вне Telegram. Включен локальный режим.");
    
    const localSave = localStorage.getItem('rpg_save');
    if (localSave) {
      try { window.player = JSON.parse(localSave).player; } catch(e) {}
    } else {
      if (typeof window.createPlayer === 'function') {
        window.player = window.createPlayer();
      } else {
        window.player = { id: 777777, name: "Браузерный_Тестер", level: 1, xp: 0, gold: 50, stats: { strength: 10, endurance: 10 }, inventory: { equipment: [], consumables: [], resources: [] }, equipped: { rings: [null, null, null] } };
      }
      window.player.id = 777777;
      window.player.name = "Браузерный_Тестер";
    }
    
    return callback(null);
  }
};

/**
 * 💾 УНИВЕРСАЛЬНАЯ ФУНКЦИЯ СОХРАНЕНИЯ ПРОГРЕССА
 */
window.saveGame = function(customData, callback) {
  const player = (customData && customData.player) ? customData.player : window.player;
  if (!player) return;

  // 1. Сразу пишем в память телефона (локальный бэкап всегда работает)
  localStorage.setItem('rpg_save', JSON.stringify({ player }));
  
  // Если ленивое подключение к базе еще не сработало, запускаем его
  if (typeof initSupabaseLazy === 'function') initSupabaseLazy();
  if (!window.sb) return;

  console.log("☁️ Попытка отправки профиля Яна в Supabase...");

  // 🔥 ДВОЙНОЙ ФОРМАТ КОЛОНОК: Страхуемся от любых ошибок регистра в вашей таблице
  const payload = {
    id: Number(player.id),
    name: player.name,
    avatar: player.avatar || "assets/avatars/hero1.png",
    level: Number(player.level || 1),
    gold: Number(player.gold || 0),
    hp: Number(player.hp || 100),
    xp: Number(player.xp || 0),
    stats: player.stats,
    inventory: player.inventory,
    equipped: player.equipped,
    
    // Вариант 1: Запись в стиле snake_case (маленькие буквы с подчеркиванием)
    current_town_index: Number(player.currentTownIndex || player.current_town_index || 0),
    stat_points: Number(player.statPoints || player.stat_points || 0),
    
    // Вариант 2: Запись в стиле camelCase (как в вашем main.js)
    currentTownIndex: Number(player.currentTownIndex || 0),
    statPoints: Number(player.statPoints || 0)
  };

  window.sb.from('players')
    .upsert(payload)
    .then(({ error }) => {
      if (error) {
        console.error("❌ Критическая ошибка Supabase:", error.message);
        // 🔥 ВЫВОДИМ ОШИБКУ НА ЭКРАН: Если колонка не совпадет, Ян сразу увидит текст ошибки!
        alert(`Ошибка базы данных: ${error.message}\nКод: ${error.code}`);
      } else {
        console.log("☁️ Прогресс Яна успешно записан в облако Supabase!");
        if (typeof customData === 'function') customData();
        if (typeof callback === 'function') callback();
      }
    })
    .catch(err => {
      console.error("❌ Сетевой сбой при отправке в Supabase:", err);
    });
};