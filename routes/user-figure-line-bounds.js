const router = require('express').Router();

const userFigureLineBoundControllers = require('../controllers/strategies/figureLineRebounds');
const userFigureLineBoundCronControllers = require('../controllers/strategies/figureLineRebounds/cron');

// cron
router.get('/cron/move-trades', userFigureLineBoundCronControllers.moveTrades);

module.exports = router;
