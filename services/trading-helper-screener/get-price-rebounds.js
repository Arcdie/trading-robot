const WebSocketClient = require('ws');

const log = require('../../libs/logger')(module);

const {
  sendMessage,
} = require('../../controllers/telegram/utils/send-message');

const {
  initTradeProcess,
} = require('../../controllers/strategies/priceRebounds/utils/init-trade-process');

const {
  app: { isTestMode },
  tradingHelperScreenerConf,
} = require('../../config');

const {
  ACTION_NAMES,
} = require('../../websocket/constants');

const CONNECTION_NAME = 'TradingRobotToTradingHelperScreener:priceRebounds';

module.exports = async () => {
  try {
    let sendPongInterval;
    const connectStr = `ws://${tradingHelperScreenerConf.host}:${tradingHelperScreenerConf.websocketPort}`;

    const websocketConnect = () => {
      let isOpened = false;
      let client = new WebSocketClient(connectStr);

      client.on('open', () => {
        isOpened = true;
        log.info(`${CONNECTION_NAME} was opened`);

        client.send(JSON.stringify({
          actionName: 'subscribe',
          data: { subscriptionName: ACTION_NAMES.get('newPriceRebound') },
        }));

        sendPongInterval = setInterval(() => {
          client.send(JSON.stringify({ actionName: 'pong' }));
        }, 10 * 60 * 1000); // 10 minutes
      });

      client.on('close', (message) => {
        log.info(`${CONNECTION_NAME} was closed`);

        client = false;
        clearInterval(sendPongInterval);
        sendMessage(260325716, `${CONNECTION_NAME} was closed (${message})`);
        websocketConnect();
      });

      client.on('message', async bufferData => {
        const parsedData = JSON.parse(bufferData.toString());

        const m = `${isTestMode ? 'Test' : 'Production'}: new strategyTargetId: ${parsedData.strategyTargetId}`;
        // log.warn(m);
        console.log(m);

        const resultInit = await initTradeProcess(parsedData.data);

        if (!resultInit || !resultInit.status) {
          log.warn(resultInit.message || 'Cant initTradeProcess');
        }
      });

      setTimeout(() => {
        if (!isOpened) {
          client = false;
          clearInterval(sendPongInterval);
          sendMessage(260325716, `Cant connect to ${CONNECTION_NAME}`);
          websocketConnect();
        }
      }, 10 * 1000); // 10 seconds
    };

    websocketConnect();
  } catch (error) {
    log.error(error.message);
    console.log(error);
    return false;
  }
};
