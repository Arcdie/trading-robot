const {
  isMongoId,
} = require('validator');

const redis = require('../../../libs/redis');
const log = require('../../../libs/logger')(module);

const UserTradeBound = require('../../../models/UserTradeBound');

const getActiveUserTradeBoundsForInstrument = async ({
  instrumentId,
  instrumentName,
}) => {
  try {
    if (!instrumentId || !isMongoId(instrumentId.toString())) {
      return {
        status: false,
        message: 'No or invalid instrumentId',
      };
    }

    if (!instrumentName) {
      return {
        status: false,
        message: 'No instrumentName',
      };
    }

    const keyInstrumentTradeBounds = `INSTRUMENT:${instrumentName}:USER_TRADE_BOUNDS`;
    const instrumentTradeBounds = await redis.hgetallAsync(keyInstrumentTradeBounds);

    if (!instrumentTradeBounds) {
      return {
        status: true,
        result: [],
      };
    }

    const result = Object.keys(instrumentTradeBounds).map(boundId => {
      const boundObj = JSON.parse(instrumentTradeBounds[boundId]);

      return {
        bound_id: boundId,
        ...boundObj,
      };
    });

    return {
      status: true,
      result,
    };

    /*
    const activeUserTradeBounds = await UserTradeBound.find({
      instrument_id: instrumentId,
      is_active: true,
    }, {
      is_long: 1,
      stoploss_price: 1,
      takeprofit_price: 1,
    }).exec();

    const result = [];
    const resultForRedis = [];

    activeUserTradeBounds.forEach(bound => {
      const boundId = bound._id.toString();

      const obj = {
        is_long: bound.is_long,
        stoploss_price: bound.stoploss_price,
        takeprofit_price: bound.takeprofit_price,
      };

      result.push({
        ...obj,
        bound_id: bound._id.toString(),
      });

      resultForRedis.push(boundId, JSON.stringify(obj));
    });

    console.log('resultForRedis', resultForRedis);

    await redis.hmsetAsync([
      keyInstrumentTradeBounds,
      ...resultForRedis,
    ]);

    return {
      status: true,
      result,
    };
    */
  } catch (error) {
    log.error(error.message);

    return {
      status: false,
      message: error.message,
    };
  }
};

// getActiveUserTradeBoundsForInstrument({
//   instrumentName: 'ZILUSDTPERP',
//   instrumentId: '616f0f7290a7836ed8d5e24d',
// });

module.exports = {
  getActiveUserTradeBoundsForInstrument,
};
