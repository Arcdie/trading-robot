const LIMIT_TIME_FOR_NEXT_TRADE = 1 * 60; // in seconds;

const TIMELIFE_FOR_USER_TRADE_BOUNDS_IN_REDIS = 1 * 24 * 60 * 60; // in seconds

const TYPES_EXIT = new Map([
  ['CANCELED', 'CANCELED'],
  ['DEACTIVATED', 'DEACTIVATED'],
]);

const TYPES_TRADES = new Map([
  ['PRICE_JUMP', 'PRICE_JUMP'],
  ['PRICE_REBOUND', 'PRICE_REBOUND'],

  ['SPOT_VOLUME', 'SPOT_VOLUME'],
]);

module.exports = {
  TYPES_EXIT,
  TYPES_TRADES,

  LIMIT_TIME_FOR_NEXT_TRADE,

  TIMELIFE_FOR_USER_TRADE_BOUNDS_IN_REDIS,
};
