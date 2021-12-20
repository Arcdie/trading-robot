const crypto = require('crypto');
const moment = require('moment');

const {
  isMongoId,
} = require('validator');

const log = require('../../../libs/logger')(module);

const {
  randStr,
} = require('../../../libs/support');

const {
  newOrder,
} = require('../../binance/utils/futures/new-order');

const {
  TYPES_TRADES,
  LIMIT_TIME_FOR_NEXT_TRADE,
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

  typeTrade,
  strategyTargetId,

  takeProfitPercent,

  stopLossPercent,
  stopLossPrice,

  side,
  type,
  quantity,
  price,
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

    if (!type || !['LIMIT', 'MARKET'].includes(type)) {
      return {
        status: false,
        message: 'No or invalid type',
      };
    }

    if (!quantity) {
      return {
        status: false,
        message: 'No quantity',
      };
    }

    if (!typeTrade || !TYPES_TRADES.get(typeTrade)) {
      return {
        status: false,
        message: 'No or invalid typeTrade',
      };
    }

    const isMarketOrder = type === 'MARKET';

    if (!isMarketOrder && !price) {
      return {
        status: false,
        message: 'No price',
      };
    }

    if (!stopLossPercent) {
      return {
        status: false,
        message: 'No stopLossPercent',
      };
    }

    if (!takeProfitPercent) {
      return {
        status: false,
        message: 'No takeProfitPercent',
      };
    }

    const limitDate = moment().add(-LIMIT_TIME_FOR_NEXT_TRADE, 'seconds');

    const doesExistUserTradeBound = await UserTradeBound.exists({
      user_id: userId,
      instrument_id: instrumentId,

      $or: [{
        is_active: true,
      }, {
        is_active: false,

        trade_ended_at: {
          $gte: limitDate,
        },
      }],
    });

    if (doesExistUserTradeBound) {
      return {
        status: true,
        isCreated: false,
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

    const myBinanceTradeId = randStr(8);

    const newTradeBound = new UserTradeBound({
      user_id: userId,
      instrument_id: instrumentId,
      strategy_target_id: strategyTargetId,
      user_binance_bound_id: userBinanceBound._id,

      quantity,
      type_trade: typeTrade,

      is_active: false,
      is_long: side === 'BUY',
      stoploss_percent: stopLossPercent,
      takeprofit_percent: takeProfitPercent,
      my_binance_trade_id: myBinanceTradeId,
    });

    if (stopLossPrice) {
      newTradeBound.stoploss_price = stopLossPrice;
    }

    await newTradeBound.save();

    let orderId;

    if (isTestMode) {
      orderId = randStr(8);
    } else {
      const timestamp = new Date().getTime();
      let signatureStr = `timestamp=${timestamp}`;

      const obj = {
        symbol: instrumentName.replace('PERP', ''),
        side,
        type,
        quantity,
        newClientOrderId: myBinanceTradeId,
      };

      if (!isMarketOrder) {
        obj.price = price;
        obj.timeInForce = 'GTC';
      }

      Object.keys(obj).forEach(key => {
        signatureStr += `&${key}=${obj[key]}`;
      });

      const signature = crypto
        .createHmac('sha256', userBinanceBound.secret)
        .update(signatureStr)
        .digest('hex');

      signatureStr += `&signature=${signature}`;

      const resultRequestNewOrder = await newOrder({
        signature,
        signatureStr,
        apikey: userBinanceBound.apikey,
      });

      if (!resultRequestNewOrder || !resultRequestNewOrder.status) {
        return {
          status: false,
          message: JSON.stringify(resultRequestNewOrder.message) || 'Cant newOrder',
        };
      }

      const resultNewOrder = resultRequestNewOrder.result;

      if (!resultNewOrder) {
        return {
          status: false,
          message: 'No resultNewOrder',
        };
      }

      orderId = resultNewOrder.orderId;
    }

    await UserTradeBound.findByIdAndUpdate(newTradeBound._id, {
      binance_trade_id: orderId,
    }).exec();

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
