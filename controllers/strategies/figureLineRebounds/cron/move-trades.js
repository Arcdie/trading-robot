const log = require('../../../../libs/logger/index')(module);

const {
  INTERVALS,
} = require('../../../candles/constants');

const UserTradeBound = require('../../../../models/UserTradeBound');
const StrategyFigureLevelRebound = require('../../../../models/StrategyFigureLevelRebound');

module.exports = async (req, res, next) => {
  try {
    const {
      query: {
        timeframe,
      },
    } = req;

    if (!timeframe || !INTERVALS.get(timeframe)) {
      return res.json({
        status: false,
        message: 'No or invalid timeframe',
      });
    }

    

    return res.json({
      status: true,
    });
  } catch (error) {
    log.error(error.message);

    return res.json({
      status: false,
      message: error.message,
    });
  }
};
