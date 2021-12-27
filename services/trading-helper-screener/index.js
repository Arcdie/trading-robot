const getPriceJumps = require('./get-price-jumps');
const getPriceRebounds = require('./get-price-rebounds');

const {
  app: { isTestMode },
} = require('../../config');

module.exports = async () => {
  if (isTestMode) {
    await getPriceJumps();
  }

  await getPriceRebounds();
};
