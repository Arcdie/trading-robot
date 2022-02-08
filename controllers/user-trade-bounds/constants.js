const LIMIT_TIME_FOR_NEXT_TRADE = 1 * 60; // in seconds;
const TIMELIFE_FOR_USER_TRADE_BOUNDS_IN_REDIS = 1 * 24 * 60 * 60; // in seconds

const TYPES_EXIT = new Map([
  ['AUTO', 'AUTO'],
  ['MANUAL', 'MANUAL'],
]);

const TYPES_TRADES = new Map([
  ['MARKET', 'MARKET'],
  ['LIMIT', 'LIMIT'],

  ['STOP', 'STOP'],
  ['STOP_MARKET', 'STOP_MARKET'],
]);

const COMMISSIONS = new Map([
  [TYPES_TRADES.get('LIMIT'), 0.02],
  [TYPES_TRADES.get('MARKET'), 0.04],
]);

module.exports = {
  TYPES_EXIT,
  TYPES_TRADES,
  COMMISSIONS,

  LIMIT_TIME_FOR_NEXT_TRADE,

  TIMELIFE_FOR_USER_TRADE_BOUNDS_IN_REDIS,
};
