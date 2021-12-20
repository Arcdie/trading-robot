const getUsersDataForFutures = require('./futures/get-users-data-for-futures');

const {
  app: { isTestMode },
} = require('../../config');

module.exports = async () => {
  if (!isTestMode) {
    await getUsersDataForFutures();
  }
};
