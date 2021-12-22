const redis = require('../../../libs/redis');
const log = require('../../../libs/logger')(module);

const {
  app: { isTestMode },
} = require('../../../config');

const clearUserTradeBoundsForInstrumentsInRedis = async () => {
  try {
    let key = 'INSTRUMENT:*:USER_TRADE_BOUNDS';

    if (isTestMode) {
      key += '_TEST';
    }

    const targetKeys = await redis.keysAsync(key);

    await Promise.all(targetKeys.map(async targetKey => {
      await redis.delAsync(targetKey);
    }));

    return {
      status: true,
    };
  } catch (error) {
    log.error(error.message);

    return {
      status: false,
      message: error.message,
    };
  }
};

module.exports = {
  clearUserTradeBoundsForInstrumentsInRedis,
};
