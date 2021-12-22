const crypto = require('crypto');

const {
  isMongoId,
} = require('validator');

const redis = require('../../../libs/redis');
const log = require('../../../libs/logger')(module);

const {
  randStr,
} = require('../../../libs/support');

const {
  cancelUserTradeBound,
} = require('./cancel-user-trade-bound');

const {
  sendMessage,
} = require('../../telegram/utils/send-message');

const {
  newOrder,
} = require('../../binance/utils/futures/new-order');

const {
  getOneByName,
} = require('../../instruments/utils/get-one-by-name');

const {
  cancelOrder,
} = require('../../binance/utils/futures/cancel-order');

const {
  app: { isTestMode },
} = require('../../../config');

const UserTradeBound = require('../../../models/UserTradeBound');
const UserBinanceBound = require('../../../models/UserBinanceBound');

const createStopLossOrder = async ({
  instrumentName,
  instrumentPrice,
  userTradeBoundId,
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

    if (!userTradeBoundId || !isMongoId(userTradeBoundId.toString())) {
      return {
        status: false,
        message: 'No or invalid userTradeBoundId',
      };
    }

    const userTradeBound = await UserTradeBound.findById(userTradeBoundId).exec();

    if (!userTradeBound) {
      return {
        status: false,
        message: 'No UserTradeBound',
      };
    }

    if (!userTradeBound.is_active) {
      return {
        status: false,
        message: 'UserTradeBound is not active',
      };
    }

    const userBinanceBound = await UserBinanceBound.findOne({
      user_id: userTradeBound.user_id,
      is_active: true,
    }).exec();

    if (!userBinanceBound) {
      return {
        status: false,
        message: 'No active UserBinanceBound',
      };
    }

    const resultRequestGetInstrument = await getOneByName({
      instrumentName,
    });

    if (!resultRequestGetInstrument) {
      const message = resultRequestGetInstrument.message || 'Cant getOneByName';
      log.warn(message);

      return {
        status: false,
        message,
      };
    }

    const futuresInstrumentDoc = resultRequestGetInstrument.result;

    if (!futuresInstrumentDoc) {
      const message = 'No Instrument';
      log.warn(message);

      return {
        status: false,
        message,
      };
    }

    const pricePrecision = futuresInstrumentDoc.price_precision;
    const price = userTradeBound.is_long ? userTradeBound.buy_price : userTradeBound.sell_price;

    let resultNewOrder;

    if (!userTradeBound.binance_stoploss_trade_id) {
      const stopLossPercent = userTradeBound.stoploss_percent / 100;
      const takeProfitPercent = userTradeBound.takeprofit_percent / 100;

      const stopLossStepSize = parseFloat((price * stopLossPercent).toFixed(pricePrecision));

      // if < 2, order will be triggered in price level
      const profitStepSize = parseFloat(((price * takeProfitPercent) * 2).toFixed(pricePrecision));

      if (!userTradeBound.stoploss_price) {
        if (userTradeBound.is_long) {
          userTradeBound.takeprofit_price = price + profitStepSize;
          userTradeBound.stoploss_price = price - stopLossStepSize;
        } else {
          userTradeBound.takeprofit_price = price - profitStepSize;
          userTradeBound.stoploss_price = price + stopLossStepSize;
        }
      } else {
        if (userTradeBound.is_long) {
          userTradeBound.takeprofit_price = price + profitStepSize;
        } else {
          userTradeBound.takeprofit_price = price - profitStepSize;
        }
      }

      userTradeBound.profit_step_size = profitStepSize;
      userTradeBound.stoploss_price = parseFloat(userTradeBound.stoploss_price.toFixed(pricePrecision));
      userTradeBound.takeprofit_price = parseFloat(userTradeBound.takeprofit_price.toFixed(pricePrecision));

      if (isTestMode) {
        resultNewOrder = { orderId: randStr(8) };
      } else {
        resultNewOrder = await sendRequestToCreateNewOrder({
          isLong: userTradeBound.is_long,
          quantity: userTradeBound.quantity,
          stopLossPrice: userTradeBound.stoploss_price,
          instrumentName: instrumentName.replace('PERP', ''),

          userSecret: userBinanceBound.secret,
          userApikey: userBinanceBound.apikey,
        });

        if (!resultNewOrder) {
          const message = `Cant create stoploss order, ${instrumentName}`;

          log.warn(message);
          await sendMessage(userTradeBound.user_id.toString(), `Не могу создать stoploss заявку:
  instrument: ${instrumentName};`);

          const resultCancel = await cancelUserTradeBound({
            instrumentName,
            userTradeBoundId,
          });

          if (!resultCancel || !resultCancel.status) {
            log.warn(resultCancel.message || 'Cant cancelUserTradeBound');
            await sendMessage(userTradeBound.user_id.toString(), `Не могу закрыть сделку:
  instrument: ${instrumentName};`);
          }

          return {
            status: false,
            message,
          };
        }
      }
    } else {
      let incrValue = 3;
      let newStopLoss;
      let newTakeProfit;

      if (userTradeBound.is_long) {
        while (1) {
          newTakeProfit = price + (userTradeBound.profit_step_size * incrValue);
          if (newTakeProfit > instrumentPrice) break;
          incrValue += 1;
        }

        // newStopLoss = (newTakeProfit - userTradeBound.profit_step_size);
        newStopLoss = (newTakeProfit - (userTradeBound.profit_step_size * 2));
      } else {
        while (1) {
          newTakeProfit = price - (userTradeBound.profit_step_size * incrValue);
          if (newTakeProfit < instrumentPrice) break;
          incrValue += 1;
        }

        // newStopLoss = (newTakeProfit + userTradeBound.profit_step_size);
        newStopLoss = (newTakeProfit + (userTradeBound.profit_step_size * 2));
      }

      newStopLoss = parseFloat(newStopLoss.toFixed(pricePrecision));

      if (isTestMode) {
        resultNewOrder = { orderId: randStr(8) };
      } else {
        resultNewOrder = await sendRequestToCreateNewOrder({
          isLong: userTradeBound.is_long,
          quantity: userTradeBound.quantity,
          stopLossPrice: newStopLoss,
          instrumentName: instrumentName.replace('PERP', ''),

          userSecret: userBinanceBound.secret,
          userApikey: userBinanceBound.apikey,
        });

        if (!resultNewOrder) {
          const message = `Cant move stoploss order, ${instrumentName}`;

          log.warn(message);
          await sendMessage(userTradeBound.user_id.toString(), `Не могу переставить stoploss заявку:
  instrument: ${instrumentName};`);

          resultNewOrder = {
            orderId: userTradeBound.binance_stoploss_trade_id,
          };

          newStopLoss = userTradeBound.stoploss_price;
        } else {
          // cancel prev stop loss order
          const timestamp = new Date().getTime();
          let signatureStr = `timestamp=${timestamp}`;

          const obj = {
            symbol: instrumentName.replace('PERP', ''),
            orderId: userTradeBound.binance_stoploss_trade_id,
          };

          Object.keys(obj).forEach(key => {
            signatureStr += `&${key}=${obj[key]}`;
          });

          const signature = crypto
            .createHmac('sha256', userBinanceBound.secret)
            .update(signatureStr)
            .digest('hex');

          signatureStr += `&signature=${signature}`;

          const resultRequestCancelOrder = await cancelOrder({
            signature,
            signatureStr,
            apikey: userBinanceBound.apikey,
          });

          if (!resultRequestCancelOrder || !resultRequestCancelOrder.status) {
            log.warn(resultRequestCancelOrder.message || 'Cant cancelOrder');
            await sendMessage(userTradeBound.user_id.toString(), `Не могу отменить прерыдущую stoploss заявку:
  instrument: ${instrumentName};`);
          }
        }
      }

      userTradeBound.stoploss_price = newStopLoss;
      userTradeBound.takeprofit_price = parseFloat(newTakeProfit.toFixed(pricePrecision));
    }

    userTradeBound.binance_stoploss_trade_id = resultNewOrder.orderId;

    await userTradeBound.save();

    // logic with redis
    let keyInstrumentTradeBounds = `INSTRUMENT:${instrumentName}:USER_TRADE_BOUNDS`;

    if (isTestMode) {
      keyInstrumentTradeBounds += '_TEST';
    }

    await redis.hsetAsync([
      keyInstrumentTradeBounds,
      userTradeBound._id.toString(),
      JSON.stringify({
        is_long: userTradeBound.is_long,
        stoploss_price: userTradeBound.stoploss_price,
        takeprofit_price: userTradeBound.takeprofit_price,
      }),
    ]);

    return {
      status: true,
      result: userTradeBound._doc,
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
  createStopLossOrder,
};

const sendRequestToCreateNewOrder = async ({
  isLong,
  quantity,
  stopLossPrice,
  instrumentName,

  userSecret,
  userApikey,
}) => {
  const timestamp = new Date().getTime();
  let signatureStr = `timestamp=${timestamp}`;

  const obj = {
    symbol: instrumentName,
    side: isLong ? 'SELL' : 'BUY',
    type: 'STOP_MARKET',
    timeInForce: 'GTC',
    stopPrice: stopLossPrice,
    quantity,
  };

  Object.keys(obj).forEach(key => {
    signatureStr += `&${key}=${obj[key]}`;
  });

  const signature = crypto
    .createHmac('sha256', userSecret)
    .update(signatureStr)
    .digest('hex');

  signatureStr += `&signature=${signature}`;

  const resultRequestNewOrder = await newOrder({
    signature,
    signatureStr,
    apikey: userApikey,
  });

  if (!resultRequestNewOrder || !resultRequestNewOrder.status) {
    const message = resultRequestNewOrder.message ?
      JSON.stringify(resultRequestNewOrder.message) : 'Cant newOrder (stoploss order)';

    log.warn(message);
    return false;
  }

  const resultNewOrder = resultRequestNewOrder.result;

  if (!resultNewOrder) {
    return false;
  }

  return resultNewOrder;
};
