const {
  isMongoId,
} = require('validator');

const log = require('../../../libs/logger')(module);

const {
  createStopLossOrder,
} = require('./create-stoploss-order');

const {
  getActiveUserTradeBoundsForInstrument,
} = require('./get-active-user-trade-bounds-for-instrument');

const {
  deactivateUserTradeBound,
} = require('./deactivate-user-trade-bound');

const {
  TYPES_EXIT,
} = require('../constants');

const {
  app: { isTestMode },
} = require('../../../config');

const checkUserTradeBounds = async ({
  instrumentId,
  instrumentName,
  askPrice,
  bidPrice,
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

    if (!askPrice) {
      return {
        status: false,
        message: 'No askPrice',
      };
    }

    if (!bidPrice) {
      return {
        status: false,
        message: 'No bidPrice',
      };
    }

    const resultGetBounds = await getActiveUserTradeBoundsForInstrument({
      instrumentId,
      instrumentName,
    });

    if (!resultGetBounds || !resultGetBounds.status) {
      const message = resultGetBounds.message || 'Cant getActiveUserTradeBoundsForInstrument (check)';
      log.warn(message);

      return {
        status: false,
        message,
      };
    }

    const activeUserTradeBounds = resultGetBounds.result;

    if (!activeUserTradeBounds || !activeUserTradeBounds.length) {
      return {
        status: true,
      };
    }

    await Promise.all(activeUserTradeBounds.map(async bound => {
      const sidePrice = bound.is_long ? bidPrice : askPrice;

      if ((bound.is_long && sidePrice > bound.takeprofit_price)
        || (!bound.is_long && sidePrice < bound.takeprofit_price)) {
        const resultCreateStopLossOrder = await createStopLossOrder({
          instrumentName,
          instrumentPrice: sidePrice,
          userTradeBoundId: bound.bound_id,
        });

        if (!resultCreateStopLossOrder || !resultCreateStopLossOrder.status) {
          const message = resultCreateStopLossOrder.message || 'Cant createStopLossOrder (check user-trade-bounds)';
          log.warn(message);
        }
      }

      if (isTestMode) {
        if ((bound.is_long && bidPrice < bound.stoploss_price)
          || (!bound.is_long && askPrice > bound.stoploss_price)) {
          const resultDeactivate = await deactivateUserTradeBound({
            typeExit: TYPES_EXIT.get('CANCELED'),
            instrumentName,
            instrumentPrice: bound.stoploss_price,
            userTradeBoundId: bound.bound_id,
          });

          if (!resultDeactivate || !resultDeactivate.status) {
            const message = resultDeactivate.message || 'Cant deactivateUserTradeBound (check user-trade-bounds)';
            log.warn(message);
          }
        }
      }
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
  checkUserTradeBounds,
};
