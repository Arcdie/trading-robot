const get1mCandlesForFuturesInstruments = require('./futures/get-1m-candles-for-futures-instruments');
// const getBookTickersForFuturesInstruments = require('./futures/get-book-tickers-for-futures-instruments');

module.exports = async () => {
  await get1mCandlesForFuturesInstruments();
};
