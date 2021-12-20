const WebSocketClient = require('ws');

const log = require('../../../libs/logger')(module);

const {
  sendMessage,
} = require('../../../controllers/telegram/utils/send-message');

const {
  checkUserTradeBounds,
} = require('../../../controllers/user-trade-bounds/utils/check-user-trade-bounds');

const {
  binanceScreenerConf,
} = require('../../../config');

const {
  ACTION_NAMES,
} = require('../../../websocket/constants');

const CONNECTION_NAME = 'TradingRobot:Futures:Kline_1m';

class InstrumentQueue {
  constructor(instrumentName) {
    this.lastTick = false;
    this.isActive = false;
    this.instrumentName = instrumentName;
  }

  updateLastTick(obj) {
    this.lastTick = obj;

    if (!this.isActive) {
      this.isActive = true;
      this.nextStep();
    }
  }

  async nextStep() {
    const resultCheckUserTradeBounds = await checkUserTradeBounds(this.lastTick);

    if (!resultCheckUserTradeBounds || !resultCheckUserTradeBounds.status) {
      log.warn(resultCheckUserTradeBounds.message || 'Cant resultCheckUserTradeBounds (futures)');
    }

    setTimeout(() => { this.nextStep(); }, 1 * 1000);
  }
}

module.exports = async () => {
  try {
    let sendPongInterval;
    const connectStr = `ws://${binanceScreenerConf.host}:${binanceScreenerConf.websocketPort}`;

    const instrumentsQueues = [];

    const websocketConnect = () => {
      let isOpened = false;
      let client = new WebSocketClient(connectStr);

      client.on('open', () => {
        isOpened = true;
        log.info(`${CONNECTION_NAME} was opened`);

        client.send(JSON.stringify({
          actionName: 'subscribe',
          data: { subscriptionName: ACTION_NAMES.get('futuresCandle1mData') },
        }));

        sendPongInterval = setInterval(() => {
          client.send(JSON.stringify({ actionName: 'pong' }));
        }, 30 * 60 * 1000); // 30 minutes
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

        const {
          instrumentName,
        } = parsedData.data;

        if (!instrumentsQueues[instrumentName]) {
          instrumentsQueues[instrumentName] = new InstrumentQueue(instrumentName);
        }

        instrumentsQueues[instrumentName].updateLastTick(parsedData.data);
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
