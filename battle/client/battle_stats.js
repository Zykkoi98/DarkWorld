// ============================================================================
// ===== 📊 ПОПОВЕРЫ СТАТОВ В БОЮ (BATTLE_STATS.JS) =====
// ===== Открытие поповеров с точными статами с сервера =====
// ============================================================================

window.BStats = {
  // Открыть поповер игрока
  openPlayerStats() {
    const pBody = document.getElementById('player-popover-body');
    if (!pBody || !BState.socket || !BState.roomId || !BState.myUuid) return;

    pBody.innerHTML = '<div style="color:#9aa0b5; padding:10px; text-align:center;">⏳ Загрузка...</div>';
    document.getElementById('monster-stats-popover').style.display = 'none';
    document.getElementById('player-stats-popover').style.display = 'flex';

    BState.socket.emit('battle_get_stats', {
      roomId: BState.roomId,
      targetUuid: BState.myUuid
    }, (response) => {
      this._renderStats(pBody, response);
    });
  },

  // Открыть поповер врага (или указанного бойца)
  openEnemyStats(targetUuid = null) {
    const mBody = document.getElementById('monster-popover-body');
    if (!mBody) return;

    const uuid = targetUuid || BState.selectedTargetUuid;
    if (!uuid || !BState.socket || !BState.roomId) return;

    mBody.innerHTML = '<div style="color:#9aa0b5; padding:10px; text-align:center;">⏳ Загрузка...</div>';
    document.getElementById('player-stats-popover').style.display = 'none';
    document.getElementById('monster-stats-popover').style.display = 'flex';

    BState.socket.emit('battle_get_stats', {
      roomId: BState.roomId,
      targetUuid: uuid
    }, (response) => {
      this._renderStats(mBody, response);
    });
  },

  _renderStats(body, response) {
    if (!response || !response.success || !Array.isArray(response.stats)) {
      body.innerHTML = `<div style="color:#e74c3c; padding:10px;">❌ ${response?.error || 'Ошибка'}</div>`;
      return;
    }

    body.innerHTML = '';

    response.stats.forEach((s) => {
      // Визуальный разделитель перед блоком "Атака" и перед "Мф."
      const isBeforeAtk = s.label.startsWith('⚔️ Атака');
      const isBeforeMf  = s.label.startsWith('🏹 Мф.');

      if (isBeforeAtk || isBeforeMf) {
        const sep = document.createElement('div');
        sep.style.cssText = 'height:1px; background:rgba(255,255,255,0.1); margin:8px 0 6px 0;';
        body.appendChild(sep);
      }

      const row = document.createElement('div');
      row.className = 'profile-row';
      row.innerHTML = `<span>${s.label}</span><span style="color:#fff; font-weight:bold;">${s.value}</span>`;
      body.appendChild(row);
    });
  },


  closeAll() {
    const p = document.getElementById('player-stats-popover');
    const m = document.getElementById('monster-stats-popover');
    if (p) p.style.display = 'none';
    if (m) m.style.display = 'none';
  }
};