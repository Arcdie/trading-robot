const redis = require('../../../libs/redis');
const log = require('../../../libs/logger')(module);

const getOneByName = async ({
  instrumentName,
}) => {
  try {
    if (!instrumentName) {
      return {
        status: false,
        message: 'No instrumentName',
      };
    }

    const key = `INSTRUMENT:${instrumentName}`;
    const instrumentDoc = await redis.getAsync(key);

    if (!instrumentDoc) {
      return { status: true };
    }

    // todo: added request to trading-helper

    return {
      status: true,
      result: JSON.parse(instrumentDoc),
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
  getOneByName,
};
