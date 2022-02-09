const crypto = require('crypto');

const {
  isMongoId,
} = require('validator');

const log = require('../../../libs/logger')(module);

const {
  cancelOrder,
} = require('../../binance/utils/futures/cancel-order');

const UserTradeBound = require('../../../models/UserTradeBound');
const UserBinanceBound = require('../../../models/UserBinanceBound');

const cancelUserTradeBound = async ({
  instrumentName,
  userTradeBoundId,
}) => {
  try {
    if (!instrumentName) {
      return {
        status: false,
        message: 'No instrumentName',
      };
    }

    if (!userTradeBoundId || !isMongoId(userTradeBoundId.toString())) {
      return {
        status: false,
        message: 'No or invalid userTradeBoundId',
      };
    }

    const userTradeBound = await UserTradeBound.findById(userTradeBoundId, {
      user_id: 1,
      is_active: 1,
      binance_trade_id: 1,
    }).exec();

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
    }, {
      secret: 1,
      apikey: 1,
    }).exec();

    if (!userBinanceBound) {
      return {
        status: false,
        message: 'No active UserBinanceBound',
      };
    }

    const timestamp = new Date().getTime();
    let signatureStr = `timestamp=${timestamp}`;

    const obj = {
      symbol: instrumentName,
      orderId: userTradeBound.binance_trade_id,
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
      signatureStr,
      apikey: userBinanceBound.apikey,
    });

    if (!resultRequestCancelOrder || !resultRequestCancelOrder.status) {
      const message = resultRequestCancelOrder.message ?
        JSON.stringify(resultRequestCancelOrder.message) : 'Cant cancelOrder';
      log.warn(message);

      return {
        status: false,
        message,
      };
    }

    const resultCancelOrder = resultRequestCancelOrder.result;

    if (!resultCancelOrder) {
      const message = 'No result in resultRequestCancelOrder';
      log.warn(message);

      return {
        status: false,
        message,
      };
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
  cancelUserTradeBound,
};
