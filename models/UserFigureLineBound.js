const mongoose = require('mongoose');

module.exports = {
  modelName: 'UserFigureLineBound',
};

module.exports.setModuleExport = (modelSchema) => {
  const UserFigureLineBound = new mongoose.Schema(modelSchema, { versionKey: false });

  module.exports = mongoose.model(
    'UserFigureLineBound',
    UserFigureLineBound,
    'user-figure-line-bounds',
  );
};
