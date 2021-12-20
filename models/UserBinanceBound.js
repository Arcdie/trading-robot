const mongoose = require('mongoose');

module.exports = {
  modelName: 'UserBinanceBound',
};

module.exports.setModuleExport = (modelSchema) => {
  const UserBinanceBound = new mongoose.Schema(modelSchema, { versionKey: false });
  module.exports = mongoose.model('UserBinanceBound', UserBinanceBound, 'user-binance-bounds');
};
