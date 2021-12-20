const log = require('../libs/logger')(module);

const memoryUsage = require('./memory-usage');
const binanceProcesses = require('./binance');
const binanceScreenerProcesses = require('./binance-screener');
const tradingHelperScreenerProcesses = require('./trading-helper-screener');

module.exports = async () => {
  try {
    await binanceProcesses();
    await binanceScreenerProcesses();
    await tradingHelperScreenerProcesses();

    // check memory
    /*
    setInterval(() => {
      memoryUsage();
    }, 10 * 1000); // 10 seconds
    // */
  } catch (error) {
    log.warn(error.message);
    return false;
  }
};
