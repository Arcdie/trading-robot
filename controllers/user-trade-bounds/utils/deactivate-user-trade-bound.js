const {
  isMongoId,
} = require('validator');

const redis = require('../../../libs/redis');
const log = require('../../../libs/logger')(module);

const {
  TYPES_EXIT,
} = require('../constants');

const UserTradeBound = require('../../../models/UserTradeBound');

const deactivateUserTradeBound = async ({
  typeExit,
  instrumentName,
  instrumentPrice,

  userTradeBoundId,
  binanceStopLossTradeId,
}) => {
  try {
    if (!instrumentPrice) {
      return {
        status: false,
        message: 'No instrumentName',
      };
    }

    if (!instrumentPrice) {
      return {
        status: false,
        message: 'No instrumentPrice',
      };
    }

    if (userTradeBoundId && !isMongoId(userTradeBoundId.toString())) {
      return {
        status: false,
        message: 'Invalid userTradeBoundId',
      };
    }

    if (!userTradeBoundId && !binanceStopLossTradeId) {
      return {
        status: false,
        message: 'No userTradeBoundId & binanceStopLossTradeId',
      };
    }

    if (!typeExit || !TYPES_EXIT.get(typeExit)) {
      return {
        status: false,
        message: 'No or invalid typeExit',
      };
    }

    const findObj = {};

    if (userTradeBoundId) {
      findObj._id = userTradeBoundId;
    }

    if (binanceStopLossTradeId) {
      findObj.binance_stoploss_trade_id = binanceStopLossTradeId;
    }

    const userTradeBound = await UserTradeBound.findOne(findObj, {
      user_id: 1,
      instrument_id: 1,

      is_long: 1,
      buy_price: 1,
      sell_price: 1,
      is_active: 1,
      type_exit: 1,
      type_trade: 1,
      trade_ended_at: 1,
    }).exec();

    if (!userTradeBound) {
      return {
        status: false,
        message: 'No UserTradeBound (deactivate bound)',
      };
    }

    if (!userTradeBound.is_active) {
      return {
        status: false,
        message: 'UserTradeBound is not active (deactivate bound)',
      };
    }

    userTradeBound.is_active = false;
    userTradeBound.type_exit = typeExit;
    userTradeBound.trade_ended_at = new Date();

    if (userTradeBound.is_long) {
      userTradeBound.sell_price = parseFloat(instrumentPrice);
    } else {
      userTradeBound.buy_price = parseFloat(instrumentPrice);
    }

    await userTradeBound.save();

    // logic with redis
    const keyInstrumentTradeBounds = `INSTRUMENT:${instrumentName}:USER_TRADE_BOUNDS`;

    await redis.hdelAsync([
      keyInstrumentTradeBounds,
      userTradeBound._id.toString(),
    ]);

    // todo: maybe here I need to cancell all orders in binance

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
  deactivateUserTradeBound,
};
