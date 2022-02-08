const getPriceJumps = require('./get-price-jumps');
const getPriceRebounds = require('./get-price-rebounds');
const getFigureLevelRebounds = require('./get-figure-level-rebounds');

const {
  app: { isTestMode },
} = require('../../config');

module.exports = async () => {
  // await getPriceJumps();
  // await getPriceRebounds();

  await getFigureLevelRebounds();
};
