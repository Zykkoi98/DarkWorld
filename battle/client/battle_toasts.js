// ============================================================================
// ===== 🍞 ТОСТЫ В БОЮ (BATTLE_TOASTS.JS) =====
// ===== АФК-предупреждения + уведомления о дисконнекте =====
// ============================================================================

window.BToasts = {
  // АФК-предупреждение
  showAfkWarning(afkCount) {
    const maxAfk = 3;
    const remaining = maxAfk - afkCount;
    if (remaining <= 0) return;

    const old = document.getElementById('afk-warning-toast');
    if (old) old.remove();

    const toast = document.createElement('div');
    toast.id = 'afk-warning-toast';
    toast.style.cssText = `
      position: fixed; top: 80px; left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #e74c3c, #c0392b);
      color: #fff; padding: 12px 20px;
      border-radius: 12px; font-weight: bold;
      font-size: 14px;
      box-shadow: 0 8px 24px rgba(231, 76, 60, 0.5);
      z-index: 99999;
      animation: afkPulse 1s infinite;
      text-align: center; max-width: 320px;
      font-family: -apple-system, sans-serif;
    `;

    toast.innerHTML = `💤 Вы пропустили ход!<br><span style="font-size:12px; opacity:0.9;">Осталось предупреждений: ${remaining}</span>`;

    if (!document.getElementById('afk-style')) {
      const style = document.createElement('style');
      style.id = 'afk-style';
      style.textContent = `@keyframes afkPulse { 0%{transform:translateX(-50%) scale(1);} 50%{transform:translateX(-50%) scale(1.05);} 100%{transform:translateX(-50%) scale(1);} }`;
      document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    if (window.Telegram?.WebApp?.HapticFeedback) {
      try { window.Telegram.WebApp.HapticFeedback.notificationOccurred('warning'); } catch(e) {}
    }

    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 4000);
  },

  // Уведомление о дисконнекте / реконнекте
  showConnectionToast(message, type = 'info') {
    const old = document.getElementById('connection-toast');
    if (old) old.remove();

    const colors = {
      warning: 'linear-gradient(135deg, #f39c12, #e67e22)',
      success: 'linear-gradient(135deg, #2ecc71, #27ae60)',
      info:    'linear-gradient(135deg, #3498db, #2980b9)'
    };

    const toast = document.createElement('div');
    toast.id = 'connection-toast';
    toast.style.cssText = `
      position: fixed; top: 120px; left: 50%;
      transform: translateX(-50%);
      background: ${colors[type] || colors.info};
      color: #fff; padding: 12px 20px;
      border-radius: 12px; font-weight: bold;
      font-size: 13px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      z-index: 99999; text-align: center;
      max-width: 320px; font-family: -apple-system, sans-serif;
      animation: connectionFadeIn 0.3s ease;
    `;
    toast.textContent = message;

    if (!document.getElementById('connection-toast-style')) {
      const style = document.createElement('style');
      style.id = 'connection-toast-style';
      style.textContent = `@keyframes connectionFadeIn { from{opacity:0; transform:translateX(-50%) translateY(-10px);} to{opacity:1; transform:translateX(-50%) translateY(0);} }`;
      document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    const timeout = type === 'warning' ? 6000 : 3000;
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, timeout);
  }
};