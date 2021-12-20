const WebSocketClient = require('ws');

const log = require('../../../libs/logger')(module);

const {
  sendMessage,
} = require('../../../controllers/telegram/utils/send-message');

const CONNECTION_NAME = 'TradingRobotToBinance:Futures:listenKey';

module.exports = async () => {
  try {

  } catch (error) {
    log.error(error.message);
    console.log(error);
    return false;
  }
};
