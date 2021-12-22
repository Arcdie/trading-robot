const redis = require('../../../libs/redis');
const log = require('../../../libs/logger')(module);

const {
  createStopLossOrder,
} = require('./create-stoploss-order');

const {
  sendMessage,
} = require('../../telegram/utils/send-message');

const {
  app: { isTestMode },
} = require('../../../config');

const UserTradeBound = require('../../../models/UserTradeBound');

const activateUserTradeBound = async ({
  instrumentName,
  instrumentPrice,
  myBinanceTradeId,
}) => {
  try {
    if (!instrumentName) {
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

    if (!myBinanceTradeId) {
      return {
        status: false,
        message: 'No myBinanceTradeId',
      };
    }

    const userTradeBound = await UserTradeBound.findOne({
      my_binance_trade_id: myBinanceTradeId,
    }, {
      is_long: 1,
      buy_price: 1,
      sell_price: 1,
      is_active: 1,
      trade_started_at: 1,
    }).exec();

    if (!userTradeBound) {
      return { status: true };
    }

    if (userTradeBound.is_active) {
      return {
        status: false,
        message: 'UserTradeBound is already active',
      };
    }

    userTradeBound.is_active = true;
    userTradeBound.trade_started_at = new Date();

    if (userTradeBound.is_long) {
      userTradeBound.buy_price = parseFloat(instrumentPrice);
    } else {
      userTradeBound.sell_price = parseFloat(instrumentPrice);
    }

    await userTradeBound.save();

    const resultCreateStopLossOrder = await createStopLossOrder({
      instrumentName,
      instrumentPrice,
      userTradeBoundId: userTradeBound._id,
    });

    if (!resultCreateStopLossOrder || !resultCreateStopLossOrder.status) {
      return {
        status: false,
        message: JSON.stringify(resultCreateStopLossOrder.message) || 'Cant createStopLossOrder (active bound)',
      };
    }

    const updatedUserTradeBound = resultCreateStopLossOrder.result;

    // logic with redis
    let keyInstrumentTradeBounds = `INSTRUMENT:${instrumentName}:USER_TRADE_BOUNDS`;

    if (isTestMode) {
      keyInstrumentTradeBounds += '_TEST';
    }

    await redis.hsetAsync([
      keyInstrumentTradeBounds,
      updatedUserTradeBound._id.toString(),
      JSON.stringify({
        is_long: updatedUserTradeBound.is_long,
        stoploss_price: updatedUserTradeBound.stoploss_price,
        takeprofit_price: updatedUserTradeBound.takeprofit_price,
      }),
    ]);

    if (!isTestMode) {
      await sendMessage(updatedUserTradeBound.user_id.toString(), `Новая сделка:
  instrument: ${instrumentName.replace('PERP', '')};
  side: ${updatedUserTradeBound.is_long ? 'long' : 'short'};
  sum: ${(updatedUserTradeBound.quantity * instrumentPrice).toFixed(1)};`);
    }

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
  activateUserTradeBound,
};
