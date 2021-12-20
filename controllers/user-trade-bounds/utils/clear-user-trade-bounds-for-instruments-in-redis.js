const redis = require('../../../libs/redis');
const log = require('../../../libs/logger')(module);

const clearUserTradeBoundsForInstrumentsInRedis = async () => {
  try {
    const key = 'INSTRUMENT:*:USER_TRADE_BOUNDS';
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
