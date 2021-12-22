const {
  isUndefined,
} = require('lodash');

const {
  isMongoId,
} = require('validator');

const log = require('../../../../libs/logger')(module);

const {
  getPrecision,
} = require('../../../../libs/support');

const {
  getOneByName,
} = require('../../../instruments/utils/get-one-by-name');

const {
  createUserTradeBound,
} = require('../../../user-trade-bounds/utils/create-user-trade-bound');

const {
  activateUserTradeBound,
} = require('../../../user-trade-bounds/utils/activate-user-trade-bound');

const {
  PRICE_JUMPS_CONSTANTS: {
    STOPLOSS_PERCENT,
    // TAKEPROFIT_PERCENT,
  },
} = require('../../constants');

const {
  WORK_AMOUNT,
} = require('../../../user-binance-bounds/constants');

const {
  TYPES_TRADES,
} = require('../../../user-trade-bounds/constants');

const {
  app: { isTestMode },
} = require('../../../../config');

const initTradeProcess = async ({
  instrumentId,
  instrumentName,
  instrumentPrice,

  isLong,
  strategyTargetId,
}) => {
  try {
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

    if (!instrumentPrice) {
      return {
        status: false,
        message: 'No instrumentPrice',
      };
    }

    if (isUndefined(isLong)) {
      return {
        status: false,
        message: 'No isLong',
      };
    }

    // todo: get from user-binance-bounds
    const usersIds = ['6176a452ef4c0005812a9729'];

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

    if (!futuresInstrumentDoc.step_size) {
      const message = 'Instrument doesnt have step_size';
      log.warn(message);

      return {
        status: false,
        message,
      };
    }

    const stepSize = futuresInstrumentDoc.step_size;
    const stepSizePrecision = getPrecision(stepSize);
    let quantity = WORK_AMOUNT / instrumentPrice;

    if (quantity < stepSize) {
      // console.log(`quantity < futuresInstrumentDoc.step_size; instrumentName: ${futuresInstrumentDoc.name}, quantity: ${quantity}, stepSize: ${stepSize}`);

      return { status: true };
    }

    const remainder = quantity % stepSize;

    if (remainder !== 0) {
      quantity -= remainder;

      if (quantity < stepSize) {
        console.log(`quantity < futuresInstrumentDoc.step_size; instrumentName: ${futuresInstrumentDoc.name}, quantity: ${quantity}, stepSize: ${stepSize}`);

        return { status: true };
      }
    }

    quantity = parseFloat(quantity.toFixed(stepSizePrecision));

    const stopLossPercent = STOPLOSS_PERCENT;
    const takeProfitPercent = STOPLOSS_PERCENT;

    const side = isLong ? 'BUY' : 'SELL';

    await Promise.all(usersIds.map(async userId => {
      const requestObj = {
        userId,
        instrumentId: futuresInstrumentDoc._id,
        instrumentName: futuresInstrumentDoc.name,
        stopLossPercent,
        takeProfitPercent,
        typeTrade: TYPES_TRADES.get('PRICE_JUMP'),
        strategyTargetId,

        side,
        type: 'MARKET',
        quantity,
      };

      const resultCreateUserTradeBound = await createUserTradeBound(requestObj);

      if (!resultCreateUserTradeBound || !resultCreateUserTradeBound.status) {
        const message = resultCreateUserTradeBound.message || 'Cant createUserTradeBound (fut)';
        log.warn(message);
        return null;
      }

      if (resultCreateUserTradeBound.isCreated) {
        if (isTestMode) {
          const resultActivate = await activateUserTradeBound({
            instrumentName: futuresInstrumentDoc.name,
            // instrumentPrice: 100,

            instrumentPrice,
            myBinanceTradeId: resultCreateUserTradeBound.result.my_binance_trade_id,
          });

          if (!resultActivate || !resultActivate.status) {
            log.warn(resultActivate.message || 'Cant activateUserTradeBound');
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

/*
initTradeProcess({
  instrumentId: '616f0f7190a7836ed8d5e1ed',
  instrumentName: 'ADAUSDTPERP',

  isLong: true,
  strategyTargetId: '616f0f7190a7836ed8d5e1ed',
});
// */

module.exports = {
  initTradeProcess,
};
