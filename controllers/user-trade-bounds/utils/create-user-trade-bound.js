const crypto = require('crypto');

const {
  isMongoId,
} = require('validator');

const log = require('../../../libs/logger')(module);

const {
  randStr,
  getPrecision,
} = require('../../../libs/support');

const {
  newOrder,
} = require('../../binance/utils/futures/new-order');

const {
  getOneByName,
} = require('../../instruments/utils/get-one-by-name');

const {
  TYPES_TRADES,
} = require('../constants');

const {
  app: { isTestMode },
} = require('../../../config');

const UserTradeBound = require('../../../models/UserTradeBound');
const UserBinanceBound = require('../../../models/UserBinanceBound');

const createUserTradeBound = async ({
  userId,
  instrumentId,
  instrumentName,

  strategyName,
  strategyTargetId,

  takeProfitPercent,

  stopLossPercent,
  stopLossPrice,

  isInitiator,
  isClosePosition, // for sl

  side,
  price,
  quantity,

  typeTrade,

  originalTradeBoundId,
}) => {
  try {
    if (!userId || !isMongoId(userId.toString())) {
      return {
        status: false,
        message: 'No or invalid userId',
      };
    }

    if (!instrumentId || !isMongoId(instrumentId.toString())) {
      return {
        status: false,
        message: 'No or invalid instrumentId',
      };
    }

    if (!strategyName) {
      return {
        status: false,
        message: 'No strategyName',
      };
    }

    if (!strategyTargetId || !isMongoId(strategyTargetId.toString())) {
      return {
        status: false,
        message: 'No or invalid strategyTargetId',
      };
    }

    if (!instrumentName) {
      return {
        status: false,
        message: 'No instrumentName',
      };
    }

    if (!side || !['BUY', 'SELL'].includes(side)) {
      return {
        status: false,
        message: 'No or invalid side',
      };
    }

    if (!typeTrade || !TYPES_TRADES.get(typeTrade)) {
      return {
        status: false,
        message: 'No or invalid typeTrade',
      };
    }

    if (originalTradeBoundId && !isMongoId(originalTradeBoundId.toString())) {
      return {
        status: false,
        message: 'Invalid originalTradeBoundId',
      };
    }

    const isMarketOrder = typeTrade === TYPES_TRADES.get('MARKET');

    if (!isMarketOrder && !price) {
      return {
        status: false,
        message: 'No price',
      };
    }

    const userBinanceBound = await UserBinanceBound.findOne({
      user_id: userId,
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

    const instrumentDoc = resultRequestGetInstrument.result;

    if (!instrumentDoc) {
      const message = 'No Instrument';
      log.warn(message);

      return {
        status: false,
        message,
      };
    }

    const stepSizePrecision = getPrecision(instrumentDoc.step_size);
    const tickSizePrecision = getPrecision(instrumentDoc.tick_size);

    const myBinanceTradeId = randStr(8);

    let validPrice;
    let validQuantity;
    let validStopLossPrice;

    if (price) {
      validPrice = parseFloat((price).toFixed(tickSizePrecision));
    }

    if (quantity) {
      validQuantity = parseFloat((quantity).toFixed(stepSizePrecision));
    }

    if (stopLossPrice) {
      validStopLossPrice = parseFloat((stopLossPrice).toFixed(tickSizePrecision));
    }

    const newTradeBound = new UserTradeBound({
      user_id: userId,
      instrument_id: instrumentId,
      user_binance_bound_id: userBinanceBound._id,

      strategy_name: strategyName,
      strategy_target_id: strategyTargetId,

      quantity: validQuantity,
      type_trade: typeTrade,

      is_active: false,
      is_test: isTestMode,

      is_long: side === 'BUY',

      my_binance_trade_id: myBinanceTradeId,

      trade_started_at: new Date(),
    });

    if (isInitiator) {
      newTradeBound.is_initiator = true;
    }

    if (!isMarketOrder) {
      newTradeBound.trigger_price = validPrice;
    }

    if (stopLossPercent) {
      newTradeBound.stoploss_percent = stopLossPercent;
    }

    if (takeProfitPercent) {
      newTradeBound.takeprofit_percent = takeProfitPercent;
    }

    if (stopLossPrice) {
      newTradeBound.stoploss_price = validStopLossPrice;
    }

    await newTradeBound.save();

    let orderId;

    if (isTestMode) {
      orderId = randStr(8);
    } else {
      const timestamp = new Date().getTime();
      let signatureStr = `timestamp=${timestamp}`;

      const obj = {
        side,
        type: typeTrade,
        newClientOrderId: myBinanceTradeId,
        symbol: instrumentName.replace('PERP', ''),
      };

      if (!isMarketOrder) {
        obj.timeInForce = 'GTC';
      }

      if (typeTrade === TYPES_TRADES.get('STOP_MARKET')) {
        obj.stopPrice = validPrice;

        if (isClosePosition) {
          obj.closePosition = true;
        }
      } else {
        obj.quantity = validQuantity;

        if (price) {
          obj.price = validPrice;
        }
      }

      Object.keys(obj).forEach(key => {
        signatureStr += `&${key}=${obj[key]}`;
      });

      const signature = crypto
        .createHmac('sha256', userBinanceBound.secret)
        .update(signatureStr)
        .digest('hex');

      signatureStr += `&signature=${signature}`;

      /*
      const resultRequestNewOrder = {
        status: true,
        result: {
          orderId: randStr(8),
        },
      };
      // */

      // /*
      const resultRequestNewOrder = await newOrder({
        signature,
        signatureStr,
        apikey: userBinanceBound.apikey,
      });
      // */

      if (!resultRequestNewOrder || !resultRequestNewOrder.status) {
        await UserTradeBound.deleteOne({
          _id: newTradeBound._id,
        }).exec();

        return {
          status: false,
          message: JSON.stringify(resultRequestNewOrder.message) || 'Cant newOrder',
        };
      }

      const resultNewOrder = resultRequestNewOrder.result;

      if (!resultNewOrder) {
        await UserTradeBound.deleteOne({
          _id: newTradeBound._id,
        }).exec();

        return {
          status: false,
          message: 'No resultNewOrder',
        };
      }

      orderId = resultNewOrder.orderId;
    }

    const updateObj = {
      binance_trade_id: orderId,
    };

    if (!isMarketOrder) {
      updateObj.is_active = true;
    }

    await UserTradeBound.findByIdAndUpdate(newTradeBound._id, updateObj).exec();

    return {
      status: true,
      result: newTradeBound,
      isCreated: true,
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
  createUserTradeBound,
};
