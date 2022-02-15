const {
  isMongoId,
} = require('validator');

const log = require('../../../../libs/logger')(module);

const {
  sendMessage,
} = require('../../../telegram/utils/send-message');

const {
  getOneByName,
} = require('../../../instruments/utils/get-one-by-name');

const {
  createUserTradeBound,
} = require('../../../user-trade-bounds/utils/create-user-trade-bound');

const {
  TYPES_TRADES,
} = require('../../../user-trade-bounds/constants');

const {
  WORK_AMOUNT,
} = require('../../../user-binance-bounds/constants');

const UserFigureLevelBound = require('../../../../models/UserFigureLevelBound');
const StrategyFigureLevelRebound = require('../../../../models/StrategyFigureLevelRebound');

const NUMBER_TRADES = 6;
const STOPLOSS_PERCENT = 0.2; // %
const PERCENT_PER_LEVEL = 0.3; // %;

const initTradeProcess = async ({
  instrumentId,
  instrumentName,

  strategyName,
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

    const strategyDoc = await StrategyFigureLevelRebound.findById(strategyTargetId, {
      status: 1,
      is_active: 1,
      number_trades: 1,
      figure_level_bound_id: 1,
    }).exec();

    if (!strategyDoc) {
      return {
        status: false,
        message: 'No StrategyFigureLevelRebound',
      };
    }

    if (!strategyDoc.is_active) {
      return {
        status: false,
        message: 'StrategyFigureLevelRebound is not active',
      };
    }

    if (strategyDoc.status !== 0) {
      return {
        status: false,
        message: 'StrategyFigureLevelRebound is not in a correct status',
      };
    }

    const userLevelBoundDoc = await UserFigureLevelBound.findById(strategyDoc.figure_level_bound_id, {
      user_id: 1,
      is_active: 1,
      is_worked: 1,
      is_moderated: 1,

      is_long: 1,
      level_price: 1,
    }).exec();

    if (!userLevelBoundDoc) {
      return {
        status: false,
        message: 'No UserFigureLevelBound',
      };
    }

    if (!userLevelBoundDoc.is_active
      || !userLevelBoundDoc.is_moderated
      || userLevelBoundDoc.is_worked) {
      return { status: true };
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

    if (!instrumentDoc.step_size) {
      const message = 'Instrument doesnt have step_size';
      log.warn(message);

      return {
        status: false,
        message,
      };
    }

    if (!instrumentDoc.tick_size) {
      const message = 'Instrument doesnt have tick_size';
      log.warn(message);

      return {
        status: false,
        message,
      };
    }

    // const tickSize = instrumentDoc.tick_size;
    const stepSize = instrumentDoc.step_size;
    let percentPerLevelPrice = userLevelBoundDoc.level_price * (PERCENT_PER_LEVEL / 100);

    const triggerPrice = userLevelBoundDoc.is_long ?
      userLevelBoundDoc.level_price - percentPerLevelPrice :
      userLevelBoundDoc.level_price + percentPerLevelPrice;

    let quantity = WORK_AMOUNT / triggerPrice;

    if (quantity < stepSize) {
      // console.log(`quantity < instrumentDoc.step_size; instrumentName: ${instrumentDoc.name}, quantity: ${quantity}, stepSize: ${stepSize}`);

      return { status: true };
    }

    const remainder = quantity % stepSize;

    if (remainder !== 0) {
      quantity -= remainder;

      if (quantity < stepSize) {
        console.log(`quantity < instrumentDoc.step_size; instrumentName: ${instrumentDoc.name}, quantity: ${quantity}, stepSize: ${stepSize}`);

        return { status: true };
      }
    }

    quantity *= NUMBER_TRADES;

    const resultCreateUserTradeBound = await createUserTradeBound({
      userId: userLevelBoundDoc.user_id,
      instrumentId,
      instrumentName,

      strategyName,
      strategyTargetId,

      typeTrade: TYPES_TRADES.get('LIMIT'),

      isInitiator: true,

      quantity,
      side: userLevelBoundDoc.is_long ? 'SELL' : 'BUY',

      price: triggerPrice,
    });

    if (!resultCreateUserTradeBound || !resultCreateUserTradeBound.status) {
      const message = resultCreateUserTradeBound.message || 'Cant createUserTradeBound (limit)';
      log.warn(message);

      return {
        status: false,
        message,
      };
    }

    percentPerLevelPrice = userLevelBoundDoc.level_price * (STOPLOSS_PERCENT / 100);

    const stopLossPrice = userLevelBoundDoc.is_long ?
      userLevelBoundDoc.level_price + percentPerLevelPrice :
      userLevelBoundDoc.level_price - percentPerLevelPrice;

    const resultCreateStopOrder = await createUserTradeBound({
      userId: userLevelBoundDoc.user_id,
      instrumentId,
      instrumentName,

      strategyName,
      strategyTargetId,

      isClosePosition: false,
      typeTrade: TYPES_TRADES.get('STOP_MARKET'),

      side: userLevelBoundDoc.is_long ? 'BUY' : 'SELL',
      quantity,

      price: stopLossPrice,
    });

    if (!resultCreateStopOrder || !resultCreateStopOrder.status) {
      const message = resultCreateStopOrder.message || 'Cant createUserTradeBound (stop-order)';
      log.warn(message);

      await sendMessage(260325716, `Alarm! Cant create SL order:
strategyName: ${strategyName}, strategyTargetId: ${strategyDoc._id}`);
    }

    strategyDoc.status += 1;
    strategyDoc.number_trades = NUMBER_TRADES;
    await strategyDoc.save();

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
  initTradeProcess,
};
