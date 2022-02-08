const WebSocketClient = require('ws');

const log = require('../../libs/logger')(module);

const {
  sendMessage,
} = require('../../controllers/telegram/utils/send-message');

const {
  checkStatus,
} = require('../../controllers/strategies/figureLevelRebounds/utils/check-status');

const {
  initTradeProcess,
} = require('../../controllers/strategies/figureLevelRebounds/utils/init-trade-process');

const {
  tradingHelperScreenerConf,
} = require('../../config');

const {
  ACTION_NAMES,
} = require('../../websocket/constants');

const CONNECTION_NAME = 'TradingRobotToTradingHelperScreener:figureLevelRebounds';

module.exports = async () => {
  /*
  try {
    setTimeout(async () => {
      const resultInit = await initTradeProcess({
        instrumentId: '616f0f7290a7836ed8d5e23d',
        instrumentName: 'NKNUSDTPERP',

        strategyName: 'figureLevelRebound',
        strategyTargetId: '62024b149172c74f87633655',
      });

      if (!resultInit || !resultInit.status) {
        console.log(resultInit);
      }
    }, 3000);
    */

    /*
    const resultChestStatus = await checkStatus({
      orderType: 'LIMIT',
      orderStatus: 'FILLED',
      price: parseFloat(1193.4),
      userTradeBoundId: '620242e7b65f255889243444',

      instrumentName: 'BTCDOMUSDTPERP',
    });

    if (!resultChestStatus || !resultChestStatus.status) {
      log.warn(resultChestStatus.message || 'Cant figureLevelReboundsUtils.checkStatus');
    }


    const resultCheckStatus = await checkStatus({
      orderType: 'LIMIT',
      orderStatus: 'FILLED',
      price: parseFloat(1230.8),
      userTradeBoundId: '620244a5c796bd8c11143ee4',

      instrumentName: 'BTCDOMUSDTPERP',
    });

    if (!resultCheckStatus || !resultCheckStatus.status) {
      log.warn(resultCheckStatus.message || 'Cant figureLevelReboundsUtils.checkStatus');
    }
  } catch (error) {
    console.log('error', error);
  }
  */

  // /*
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
          data: { subscriptionName: ACTION_NAMES.get('figureLevelRebound') },
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
  // */
};
