const mongoose = require('mongoose');

module.exports = {
  modelName: 'UserTradeBound',
};

module.exports.setModuleExport = (modelSchema) => {
  const UserTradeBound = new mongoose.Schema(modelSchema, { versionKey: false });
  module.exports = mongoose.model('UserTradeBound', UserTradeBound, 'user-trade-bounds');
};
