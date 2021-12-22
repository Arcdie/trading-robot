const fileName = __filename.split('/');
const projectFolder = fileName[fileName.length - 3];

const isTestMode = projectFolder.includes('-test');

module.exports = {
  app: {
    host: 'localhost',
    environment: process.env.NODE_ENV,
    url: !isTestMode ? process.env.APP_URL : process.env.TEST_APP_URL,
    port: !isTestMode ? process.env.APP_PORT : process.env.TEST_APP_PORT,

    isTestMode,
  },

  mongodbConf: {
    url: `mongodb://${process.env.MONGODB_HOST}:${process.env.MONGODB_PORT}/${process.env.MONGODB_DATABASE}`,
    options: {
      connectTimeoutMS: 30000,
    },
  },

  redisConf: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },

  tradingHelperConf: {
    url: 'trading-helper.ru',
    websocketPort: 3100,
    token: process.env.TRADING_HELPER_AUTH_TOKEN,
  },

  binanceScreenerConf: {
    host: process.env.BINANCE_SCREENER_HOST,
    websocketPort: 3101,
  },

  tradingHelperScreenerConf: {
    host: process.env.TRADING_HELPER_SCREENER_HOST,
    websocketPort: 3102,
  },
};
