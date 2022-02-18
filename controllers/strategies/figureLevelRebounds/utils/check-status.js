const {
  isMongoId,
} = require('validator');

const log = require('../../../../libs/logger')(module);

const {
  sendMessage,
} = require('../../../telegram/utils/send-message');

const {
  cancelUserTradeBound,
} = require('../../../user-trade-bounds/utils/cancel-user-trade-bound');

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
const StrategyFigureLevelRebound = require('../../../../models/StrategyFigureLevelRebound');

const STOPLOSS_PERCENT = 0.5; // %

const checkStatus = async ({
  price,
  orderType,
  orderStatus,
  userTradeBoundId,

  instrumentName,
}) => {
  try {
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
        if (userTradeBoundDoc.remark && userTradeBoundDoc.remark === 'transfer sl') {
          return { status: true };
        }

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

          const quantity = userTradeBoundDoc.quantity / strategyDoc.number_trades;

          // todo: get constants
          // fot 6: 1.5, 3, 4.5
          const arr = [STOPLOSS_PERCENT * 3, STOPLOSS_PERCENT * 6, STOPLOSS_PERCENT * 9];

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

              quantity: quantity * 2,
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

          sendMessage(260325716, `Сработала лимитная заявка, ${instrumentName}`);
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

            // remove not triggered sl
            await UserTradeBound.deleteOne({
              is_active: true,
              strategy_target_id: strategyDoc._id,
              type_trade: TYPES_TRADES.get('STOP_MARKET'),
            }).exec();

            return { status: true };
          }

          if (strategyDoc.number_trades - numberActiveLimitTrades === 1) {
            const activeStopLossOrder = await UserTradeBound.findOne({
              strategy_target_id: strategyDoc._id,
              type_trade: TYPES_TRADES.get('STOP_MARKET'),
            }, {
              remark: 1,
              is_long: 1,
              quantity: 1,
              trigger_price: 1,
            }).exec();

            activeStopLossOrder.remark = 'transfer sl';
            await activeStopLossOrder.save();

            const resultCancelTrade = await cancelUserTradeBound({
              userTradeBoundId: activeStopLossOrder._id,
              instrumentName: instrumentName.replace('PERP', ''),
            });

            if (!resultCancelTrade || !resultCancelTrade.status) {
              const message = resultCancelTrade.message || 'Cant cancelUserTradeBound (stop-order)';
              log.warn(message);

              await sendMessage(260325716, `Alarm! Cant replace SL order:
      strategyName: ${userTradeBoundDoc.strategy_name}, strategyTargetId: ${strategyDoc._id}`);

              return {
                status: false,
                message,
              };
            }

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

              isClosePosition: true,
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
