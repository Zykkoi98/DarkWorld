// ============================================================================
// ===== 🗂️ ЛОКАЛЬНОЕ СОСТОЯНИЕ БОЯ (BATTLE_STATE.JS) =====
// ===== Хранит teamA, teamB, myUuid, roomId, роль =====
// ============================================================================

window.BState = {
  // Идентификаторы
  roomId: null,
  myUuid: null,
  battleType: null,
  isSpectator: false,
  // 🔥 Финальные награды PvP
  finalRewards: null,
  rewardsShown: false,

  // Команды
  teamA: [],
  teamB: [],

  // Тактические зоны (выбор игрока)
  selectedTargetUuid: null,
  selectedAttackZone: null,
  selectedDefendZones: [],

  // Архив логов
  allLogs: [],

  // Сокет
  socket: null,

  // Служебное
  isBattleOver: false,
  spectatorCount: 0,

  // ==========================================================================
  // ГЕТТЕРЫ
  // ==========================================================================

  getMyFighter() {
    return [...this.teamA, ...this.teamB].find(f => f.uuid === this.myUuid) || null;
  },

  getOpposingTeam() {
    const me = this.getMyFighter();
    if (!me) return [];
    return this.teamA.includes(me) ? this.teamB : this.teamA;
  },

  getMyTeam() {
    const me = this.getMyFighter();
    if (!me) return [];
    return this.teamA.includes(me) ? this.teamA : this.teamB;
  },

  getTargetFighter() {
    if (!this.selectedTargetUuid) return null;
    return [...this.teamA, ...this.teamB].find(f => f.uuid === this.selectedTargetUuid) || null;
  },

  findFighter(uuid) {
    return [...this.teamA, ...this.teamB].find(f => f.uuid === uuid) || null;
  },

  // ==========================================================================
  // СБРОС
  // ==========================================================================

  reset() {
    this.roomId = null;
    this.myUuid = null;
    this.battleType = null;
    this.isSpectator = false;
    this.teamA = [];
    this.teamB = [];
    this.selectedTargetUuid = null;
    this.selectedAttackZone = null;
    this.selectedDefendZones = [];
    this.allLogs = [];
    this.isBattleOver = false;
    this.spectatorCount = 0;
    this.finalRewards = null;
    this.rewardsShown = false;
  }
};