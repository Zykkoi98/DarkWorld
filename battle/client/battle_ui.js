// ============================================================================
// ===== 🎮 UI-ЛОГИКА БОЯ (BATTLE_UI.JS) =====
// ===== Кнопки, зоны, отправка хода =====
// ============================================================================

window.BUI = {
  ZONES: ['head', 'breast', 'torso', 'belt', 'legs'],

  // ==========================================================================
  // ИНИЦИАЛИЗАЦИЯ — привязка событий
  // ==========================================================================
  init() {
    if (BState.isSpectator) {
      this.hideFighterUI();
      return;
    }
    this.bindAttackZones();
    this.bindDefendZones();
    this.bindStrikeButton();
    this.bindRandomButton();
    this.bindPotionButton();
  },

  // ==========================================================================
  // СКРЫТЬ UI ДЛЯ ЗРИТЕЛЯ
  // ==========================================================================
  hideFighterUI() {
    const tacticalPanel = document.querySelector('.tactical-center-controls');
    if (tacticalPanel) tacticalPanel.style.display = 'none';

    const quickSlots = document.querySelectorAll('.quick-slots-row');
    quickSlots.forEach(el => el.style.display = 'none');

    // Показать кнопку закрытия просмотра
    this.showSpectatorCloseBtn();

    // Заголовок режима зрителя
    const header = document.getElementById('battle-round-indicator');
    if (header) header.textContent = '👁️ Режим зрителя';

    console.log('👁️ [UI] Режим зрителя — кнопки скрыты');
  },

  showSpectatorCloseBtn() {
    const bottom = document.querySelector('.battle-bottom');
    if (!bottom) return;

    if (document.getElementById('spectator-close-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'spectator-close-btn';
    btn.textContent = '❌ ЗАКРЫТЬ ПРОСМОТР';
    btn.style.cssText = `
      width: 100%; margin-top: 12px;
      padding: 14px;
      background: #e74c3c; border: none;
      color: #fff; font-weight: bold;
      border-radius: 10px; cursor: pointer;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(231, 76, 60, 0.3);
    `;
    btn.onclick = () => {
      if (BState.socket) {
        BState.socket.emit('battle_spectator_leave', { roomId: BState.roomId });
      }
      window.history.back();
    };

    bottom.appendChild(btn);
  },

  // ==========================================================================
  // ЗОНЫ АТАКИ
  // ==========================================================================
  bindAttackZones() {
    document.querySelectorAll('.btn-atk').forEach(btn => {
      btn.onclick = () => {
        const zone = btn.getAttribute('data-zone');
        const { maxAttacks } = this.getLimits();

        if (maxAttacks === 2) {
          // Массив из 2 зон
          if (!Array.isArray(BState.selectedAttackZone)) BState.selectedAttackZone = [];
          const idx = BState.selectedAttackZone.indexOf(zone);
          if (idx !== -1) {
            BState.selectedAttackZone.splice(idx, 1);
            btn.classList.remove('attack-selected');
          } else {
            if (BState.selectedAttackZone.length >= 2) {
              const removed = BState.selectedAttackZone.shift();
              document.querySelector(`.btn-atk[data-zone="${removed}"]`)?.classList.remove('attack-selected');
            }
            BState.selectedAttackZone.push(zone);
            btn.classList.add('attack-selected');
          }
        } else {
          // Одна зона
          document.querySelectorAll('.btn-atk').forEach(b => b.classList.remove('attack-selected'));
          BState.selectedAttackZone = zone;
          btn.classList.add('attack-selected');
        }

        this.updateStrikeButtonState();
      };
    });
  },

  // ==========================================================================
  // ЗОНЫ БЛОКА
  // ==========================================================================
  bindDefendZones() {
    document.querySelectorAll('.btn-def').forEach(btn => {
      btn.onclick = () => {
        const zone = btn.getAttribute('data-zone');
        const { maxDefends } = this.getLimits();

        const idx = BState.selectedDefendZones.indexOf(zone);
        if (idx !== -1) {
          BState.selectedDefendZones.splice(idx, 1);
          btn.classList.remove('defend-selected');
        } else {
          if (BState.selectedDefendZones.length >= maxDefends) {
            const removed = BState.selectedDefendZones.shift();
            document.querySelector(`.btn-def[data-zone="${removed}"]`)?.classList.remove('defend-selected');
          }
          BState.selectedDefendZones.push(zone);
          btn.classList.add('defend-selected');
        }

        this.updateStrikeButtonState();
      };
    });
  },

  // ==========================================================================
  // ЛИМИТЫ АТАК/БЛОКОВ (на клиенте — для UI)
  // ==========================================================================
  getLimits() {
    const me = BState.getMyFighter();
    if (!me || !me.equipped) {
      return { maxAttacks: 1, maxDefends: (me && Number(me.level) <= 1) ? 2 : 1 };
    }

    const mh = me.equipped.mainHand;
    const oh = me.equipped.offHand;

    const isShield = (id) => {
      if (!id) return false;
      const d = window.getItemData ? window.getItemData(id) : null;
      if (d) {
        const name = (d.name || '').toLowerCase();
        if (name.includes('щит') || name.includes('баклер') || name.includes('эгида') ||
            name.includes('оберег') || name.includes('бастион') || name.includes('скутум')) return true;
      }
      const i = String(id).toLowerCase();
      return i.includes('shield') || i.includes('buckler') || i.includes('aegis') ||
             i.includes('scutum') || i.includes('bastion') || i.includes('parry');
    };

    const isTwo = mh && (mh === 'heavy_halberd' || String(mh).includes('twoHanded') ||
      (window.getItemData?.(mh)?.slotType === 'twoHanded'));

    let maxAttacks = 1;
    let maxDefends = 1;

    if (isTwo) maxAttacks = 1;
    else if (oh && !isShield(oh)) maxAttacks = 2;
    else maxAttacks = 1;

    if (isShield(oh)) maxDefends = 3;
    else if (Number(me.level || 1) <= 1) maxDefends = 2;
    else maxDefends = 1;

    return { maxAttacks, maxDefends };
  },

  // ==========================================================================
  // КНОПКА «АТАКОВАТЬ» — состояние
  // ==========================================================================
  updateStrikeButtonState() {
    const btn = document.getElementById('strike-action-btn');
    if (!btn) return;
    if (BState.isBattleOver) { btn.disabled = true; return; }

    const { maxAttacks, maxDefends } = this.getLimits();

    const hasAttack = (maxAttacks === 2)
      ? (Array.isArray(BState.selectedAttackZone) && BState.selectedAttackZone.length === 2)
      : !!BState.selectedAttackZone;

    const hasDefend = BState.selectedDefendZones.length === maxDefends;
    const hasTarget = !!BState.selectedTargetUuid;

    btn.disabled = !(hasAttack && hasDefend && hasTarget);
  },

  // ==========================================================================
  // ОТПРАВКА ХОДА
  // ==========================================================================
  bindStrikeButton() {
    const btn = document.getElementById('strike-action-btn');
    if (!btn) return;

    btn.onclick = () => {
      if (BState.isBattleOver) {
        if (BState.socket) BState.socket.disconnect();
        window.location.replace('../index.html');
        return;
      }

      if (btn.disabled) return;

      btn.disabled = true;
      btn.textContent = 'Расчет...';

      BState.socket.emit('battle_submit_turn', {
        roomId: BState.roomId,
        targetUuid: String(BState.selectedTargetUuid),
        attack: BState.selectedAttackZone,
        defends: BState.selectedDefendZones
      });
    };
  },

  // ==========================================================================
  // СЛУЧАЙНЫЙ ХОД
  // ==========================================================================
  bindRandomButton() {
    const btn = document.getElementById('random-strike-btn');
    if (!btn) return;

    btn.onclick = () => {
      // Восстанавливаем цель
      if (!BState.selectedTargetUuid) {
        const target = BState.getOpposingTeam().find(f => f.currentHp > 0);
        if (target) BState.selectedTargetUuid = target.uuid;
      }
      if (!BState.selectedTargetUuid) return alert('❌ Нет цели');

      const zones = this.ZONES;
      const { maxAttacks, maxDefends } = this.getLimits();

      document.querySelectorAll('.btn-atk').forEach(b => b.classList.remove('attack-selected'));
      document.querySelectorAll('.btn-def').forEach(b => b.classList.remove('defend-selected'));

      // Атака
      if (maxAttacks === 2) {
        BState.selectedAttackZone = [];
        while (BState.selectedAttackZone.length < 2) {
          const z = zones[Math.floor(Math.random() * zones.length)];
          if (!BState.selectedAttackZone.includes(z)) BState.selectedAttackZone.push(z);
        }
        BState.selectedAttackZone.forEach(z => {
          document.querySelector(`.btn-atk[data-zone="${z}"]`)?.classList.add('attack-selected');
        });
      } else {
        BState.selectedAttackZone = zones[Math.floor(Math.random() * zones.length)];
        document.querySelector(`.btn-atk[data-zone="${BState.selectedAttackZone}"]`)?.classList.add('attack-selected');
      }

      // Блоки
      BState.selectedDefendZones = [];
      while (BState.selectedDefendZones.length < maxDefends) {
        const z = zones[Math.floor(Math.random() * zones.length)];
        if (!BState.selectedDefendZones.includes(z)) BState.selectedDefendZones.push(z);
      }
      BState.selectedDefendZones.forEach(z => {
        document.querySelector(`.btn-def[data-zone="${z}"]`)?.classList.add('defend-selected');
      });

      this.updateStrikeButtonState();
      if (!document.getElementById('strike-action-btn')?.disabled) {
        document.getElementById('strike-action-btn')?.click();
      }
    };
  },

  // ==========================================================================
  // БАНКА
  // ==========================================================================
  bindPotionButton() {
    const btn = document.getElementById('quick-potion-btn');
    if (!btn) return;

    btn.onclick = () => {
      if (btn.disabled) return;
      btn.disabled = true;
      BState.socket.emit('battle_use_potion', { roomId: BState.roomId });
    };
  },

  // Обновить состояние кнопки банки
  updatePotionButton() {
    const btn = document.getElementById('quick-potion-btn');
    if (!btn) return;

    const me = BState.getMyFighter();
    const potion = me?.equipped?.potion;

    if (potion && typeof potion === 'object' && potion.id && potion.count > 0) {
      const d = window.getItemData ? window.getItemData(potion.id) : null;
      btn.disabled = false;
      btn.innerHTML = `${d?.icon || '🧪'} <span style="color:#2ecc71; font-size:11px; font-weight:bold;">x${potion.count}</span>`;
      btn.style.border = '1px solid #2ecc71';
      btn.style.boxShadow = '0 0 8px rgba(46, 204, 113, 0.4)';
    } else {
      btn.disabled = true;
      btn.innerHTML = '🧪';
      btn.style.border = '1px solid rgba(255,255,255,0.08)';
      btn.style.boxShadow = 'none';
    }
  },

  // ==========================================================================
  // ПОСЛЕ РАУНДА — сброс выбора
  // ==========================================================================
  resetSelection() {
    BState.selectedAttackZone = null;
    BState.selectedDefendZones = [];
    document.querySelectorAll('.btn-atk').forEach(b => b.classList.remove('attack-selected'));
    document.querySelectorAll('.btn-def').forEach(b => b.classList.remove('defend-selected'));
    this.updateStrikeButtonState();
  }
};