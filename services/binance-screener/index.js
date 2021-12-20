const getBookTickersForFuturesInstruments = require('./futures/get-book-tickers-for-futures-instruments');

module.exports = async () => {
  await getBookTickersForFuturesInstruments();
};
