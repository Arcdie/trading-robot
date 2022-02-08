const mongoose = require('mongoose');

module.exports = {
  modelName: 'UserFigureLevelBound',
};

module.exports.setModuleExport = (modelSchema) => {
  const UserFigureLevelBound = new mongoose.Schema(modelSchema, { versionKey: false });

  module.exports = mongoose.model(
    'UserFigureLevelBound',
    UserFigureLevelBound,
    'user-figure-level-bounds',
  );
};
