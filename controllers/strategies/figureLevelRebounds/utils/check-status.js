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
  cancelAllUserTradesForInstrument,
} = require('../../../user-trade-bounds/utils/cancel-all-user-trades-for-instrument');

const {
  createUserTradeBound,
} = require('../../../user-trade-bounds/utils/create-user-trade-bound');

const {
  COMMISSIONS,
  TYPES_EXIT,
  TYPES_TRADES,
} = require('../../../user-trade-bounds/constants');

const UserTradeBound = require('../../../../models/UserTradeBound');
const UserFigureLevelBound = require('../../../../models/UserFigureLevelBound');
const StrategyFigureLevelRebound = require('../../../../models/StrategyFigureLevelRebound');

const checkStatus = async ({
  price,
  orderType,
  orderStatus,
  userTradeBoundId,

  instrumentName,
}) => {
  try {
    if (!price) {
      return {
        status: false,
        message: 'No price',
      };
    }

    if (!orderType) {
      return {
        status: false,
        message: 'No orderType',
      };
    }

    if (!orderStatus) {
      return {
        status: false,
        message: 'No orderStatus',
      };
    }

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

    const userTradeBoundDoc = await UserTradeBound.findById(userTradeBoundId).exec();

    if (!userTradeBoundDoc) {
      return {
        status: false,
        message: 'No UserTradeBound',
      };
    }

    const strategyDoc = await StrategyFigureLevelRebound.findById(userTradeBoundDoc.strategy_target_id, {
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

    if (orderType === TYPES_TRADES.get('STOP_MARKET')) {
      if (orderStatus === 'CANCELED') {
        // .. logic with manual reject

        strategyDoc.is_active = false;
        await strategyDoc.save();
      }

      return { status: true };
    }

    if (orderType === TYPES_TRADES.get('MARKET')) {
      if (orderStatus !== 'FILLED') {
        return {
          status: false,
          message: `MARKET is not FILLED -> ${orderStatus}`,
        };
      }

      userTradeBoundDoc.is_active = false;
      userTradeBoundDoc.trade_ended_at = new Date();
      userTradeBoundDoc.type_exit = TYPES_EXIT.get('AUTO');

      const sumCommission = COMMISSIONS.get(TYPES_TRADES.get('MARKET'));
      userTradeBoundDoc.sum_commission = parseFloat((price * (sumCommission / 100)).toFixed(3));

      if (userTradeBoundDoc.is_long) {
        userTradeBoundDoc.sell_price = price;
      } else {
        userTradeBoundDoc.buy_price = price;
      }

      await userTradeBoundDoc.save();

      const activeLimitUserTradeBounds = await UserTradeBound.find({
        is_active: true,
        strategy_target_id: strategyDoc._id,
        type_trade: TYPES_TRADES.get('LIMIT'),
      }).exec();

      if (activeLimitUserTradeBounds.length) {
        const resultCancel = await cancelAllUserTradesForInstrument({
          userId: userTradeBoundDoc.user_id,
          instrumentName: instrumentName.replace('PERP', ''),
        });

        if (!resultCancel || !resultCancel.status) {
          const message = resultCancel.message || 'Cant cancelAllUserTradesForInstrument';

          log.warn(message);
          return {
            status: false,
            message,
          };
        }

        const limitTradesIds = activeLimitUserTradeBounds
          .map(bound => bound._id);

        await UserTradeBound.deleteMany({
          _id: { $in: limitTradesIds },
        }).exec();
      }

      strategyDoc.is_active = false;
      await strategyDoc.save();

      return { status: true };
    }

    switch (strategyDoc.status) {
      case 0: {
        return {
          status: false,
          message: 'StrategyFigureLevelRebound is not active',
        };
      }

      case 1: {
        if (orderType === TYPES_TRADES.get('LIMIT')) {
          if (orderStatus !== 'FILLED') {
            return {
              status: false,
              message: `Status 1, LIMIT is not FILLED -> ${orderStatus}`,
            };
          }

          userTradeBoundDoc.is_active = false;
          userTradeBoundDoc.trade_ended_at = new Date();
          userTradeBoundDoc.type_exit = TYPES_EXIT.get('AUTO');

          const sumCommission = COMMISSIONS.get(TYPES_TRADES.get('LIMIT'));
          userTradeBoundDoc.sum_commission = price * (sumCommission / 100);

          if (userTradeBoundDoc.is_long) {
            userTradeBoundDoc.buy_price = price;
          } else {
            userTradeBoundDoc.sell_price = price;
          }

          await userTradeBoundDoc.save();

          const userLevelBoundDoc = await UserFigureLevelBound.findById(strategyDoc.figure_level_bound_id, {
            is_long: 1,
            is_active: 1,
            is_worked: 1,
            level_price: 1,
          }).exec();

          if (!userLevelBoundDoc) {
            return {
              status: false,
              message: 'No UserFigureLevelBound',
            };
          }

          if (!userLevelBoundDoc.is_active || userLevelBoundDoc.is_worked) {
            // todo: add logic finish strategy
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

          const quantity = userTradeBoundDoc.quantity / strategyDoc.number_trades;
          const stopLossPrice = userLevelBoundDoc.level_price + instrumentDoc.tick_size;

          const arr = [];
          for (let i = 0; i < strategyDoc.number_trades; i += 1) {
            arr.push(i + 1);
          }

          const resultCreateStopOrder = await createUserTradeBound({
            userId: userTradeBoundDoc.user_id,

            instrumentName,
            instrumentId: userTradeBoundDoc.instrument_id,

            strategyName: userTradeBoundDoc.strategy_name,
            strategyTargetId: strategyDoc._id,

            typeTrade: TYPES_TRADES.get('STOP_MARKET'),

            side: userLevelBoundDoc.is_long ? 'BUY' : 'SELL',
            quantity,

            price: stopLossPrice,
          });

          if (!resultCreateStopOrder || !resultCreateStopOrder.status) {
            const message = resultCreateStopOrder.message || 'Cant createUserTradeBound (stop-order)';
            log.warn(message);

            await sendMessage(260325716, `Alarm! Cant create SL order:
    strategyName: ${userTradeBoundDoc.strategy_name}, strategyTargetId: ${strategyDoc._id}`);

            return {
              status: false,
              message,
            };
          }

          for await (const iterator of arr) {
            const sumPerInitiatorTriggerPrice = userTradeBoundDoc.trigger_price * (iterator / 100);

            const triggerPrice = userTradeBoundDoc.is_long ?
              userTradeBoundDoc.trigger_price + sumPerInitiatorTriggerPrice :
              userTradeBoundDoc.trigger_price - sumPerInitiatorTriggerPrice;

            const resultCreateLimitOrder = await createUserTradeBound({
              userId: userTradeBoundDoc.user_id,

              instrumentName,
              instrumentId: userTradeBoundDoc.instrument_id,

              strategyName: userTradeBoundDoc.strategy_name,
              strategyTargetId: strategyDoc._id,

              typeTrade: TYPES_TRADES.get('LIMIT'),

              quantity,
              side: userTradeBoundDoc.is_long ? 'SELL' : 'BUY',

              price: triggerPrice,
            });

            if (!resultCreateLimitOrder || !resultCreateLimitOrder.status) {
              const message = resultCreateLimitOrder.message || 'Cant createUserTradeBound (limit)';
              log.warn(message);
              continue;
            }
          }

          strategyDoc.status += 1;
          await strategyDoc.save();
        }

        break;
      }

      case 2: {
        if (orderType === TYPES_TRADES.get('LIMIT')) {
          if (orderStatus !== 'FILLED') {
            return {
              status: false,
              message: `Status 1, LIMIT is not FILLED -> ${orderStatus}`,
            };
          }

          userTradeBoundDoc.is_active = false;
          userTradeBoundDoc.trade_ended_at = new Date();
          userTradeBoundDoc.type_exit = TYPES_EXIT.get('AUTO');

          const sumCommission = COMMISSIONS.get(TYPES_TRADES.get('LIMIT'));
          userTradeBoundDoc.sum_commission = parseFloat((price * (sumCommission / 100)).toFixed(3));

          if (userTradeBoundDoc.is_long) {
            userTradeBoundDoc.buy_price = price;
          } else {
            userTradeBoundDoc.sell_price = price;
          }

          await userTradeBoundDoc.save();

          const numberActiveLimitTrades = await UserTradeBound.count({
            is_active: true,
            type_trade: TYPES_TRADES.get('LIMIT'),
            strategy_target_id: strategyDoc._id,
          });

          if (!numberActiveLimitTrades) {
            const resultCancel = await cancelAllUserTradesForInstrument({
              userId: userTradeBoundDoc.user_id,
              instrumentName: instrumentName.replace('PERP', ''),
            });

            if (!resultCancel || !resultCancel.status) {
              const message = resultCancel.message || 'Cant cancelAllUserTradesForInstrument';
              log.warn(message);

              return {
                status: false,
                message,
              };
            }

            return { status: true };
          }

          if (strategyDoc.number_trades - numberActiveLimitTrades === 1) {
            const activeStopLossOrder = await UserTradeBound.findOne({
              strategy_target_id: strategyDoc._id,
              type_trade: TYPES_TRADES.get('STOP_MARKET'),
            }, {
              is_long: 1,
              quantity: 1,
            }).exec();

            const initiatorOrder = await UserTradeBound.findOne({
              is_initiator: true,
              strategy_target_id: strategyDoc._id,
              type_trade: TYPES_TRADES.get('LIMIT'),
            }, {
              quantity: 1,
              trigger_price: 1,
              sum_commission: 1,
            }).exec();

            const fullSumCommisions = initiatorOrder.sum_commission * 3;

            const stopLossPrice = activeStopLossOrder.is_long ?
              initiatorOrder.trigger_price - fullSumCommisions :
              initiatorOrder.trigger_price + fullSumCommisions;

            const resultCreateStopOrder = await createUserTradeBound({
              userId: userTradeBoundDoc.user_id,

              instrumentName,
              instrumentId: userTradeBoundDoc.instrument_id,

              strategyName: userTradeBoundDoc.strategy_name,
              strategyTargetId: strategyDoc._id,

              typeTrade: TYPES_TRADES.get('STOP_MARKET'),

              quantity: activeStopLossOrder.quantity,
              side: activeStopLossOrder.is_long ? 'BUY' : 'SELL',

              price: stopLossPrice,
            });

            if (!resultCreateStopOrder || !resultCreateStopOrder.status) {
              const message = resultCreateStopOrder.message || 'Cant createUserTradeBound (stop-order)';
              log.warn(message);

              await sendMessage(260325716, `Alarm! Cant create SL order:
      strategyName: ${userTradeBoundDoc.strategy_name}, strategyTargetId: ${strategyDoc._id}`);

              return {
                status: false,
                message,
              };
            }

            await UserTradeBound.deleteOne({
              _id: activeStopLossOrder._id,
            }).exec();
          }
        }

        break;
      }

      default: {
        return {
          status: false,
          message: 'Undefined status',
        };
      }
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
  checkStatus,
};
