// ============================================================================
// ===== 🚀 ТОЧКА ВХОДА БОЯ (BATTLE_CLIENT.JS) =====
// ===== Определяет роль, подключает сокет =====
// ============================================================================

(function() {
  'use strict';

  console.log('🎬 [BATTLE CLIENT] Запуск...');

  // ==========================================================================
  // ЗАГРУЗКА ПРОФИЛЯ ИЗ LOCALSTORAGE
  // ==========================================================================
  function getLocalPlayer() {
    const localSave = localStorage.getItem('rpg_save');
    if (!localSave) return null;
    try { return JSON.parse(localSave).player; } catch(e) { return null; }
  }

  // ==========================================================================
  // СТАРТ
  // ==========================================================================
  function startBattlePage() {
    const localPlayer = getLocalPlayer();
    const urlParams = new URLSearchParams(window.location.search);
    const isSpectator = urlParams.has('spectate');

    // Для участника — обязателен профиль
    if (!isSpectator && !localPlayer) {
      alert('❌ Профиль не найден! Вернитесь в город.');
      window.location.href = '../index.html';
      return;
    }

    const userId = localPlayer?.id || null;

    // Инициализация сокета (сам решит — что делать)
    BSocket.init(userId);
  }

  // ==========================================================================
  // ЗАПУСК
  // ==========================================================================
  window.addEventListener('DOMContentLoaded', () => {
    // Небольшая задержка — чтобы все модули загрузились
    setTimeout(startBattlePage, 50);
  });

})();