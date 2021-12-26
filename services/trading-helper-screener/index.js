const getPriceJumps = require('./get-price-jumps');
const getPriceRebounds = require('./get-price-rebounds');

module.exports = async () => {
  // await getPriceJumps();
  await getPriceRebounds();
};
