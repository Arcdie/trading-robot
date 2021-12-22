const mongoose = require('mongoose');

const {
  app: { isTestMode },
} = require('../config');

module.exports = {
  modelName: 'UserTradeBound',
};

module.exports.setModuleExport = (modelSchema) => {
  let collectionName = 'user-trade-bounds';

  if (isTestMode) {
    collectionName += '_test';
  }

  const UserTradeBound = new mongoose.Schema(modelSchema, { versionKey: false });
  module.exports = mongoose.model('UserTradeBound', UserTradeBound, collectionName);
};
