import * as express from 'express';
import holidayCtrl from './holiday.ctrl';
const router: express.Router = express.Router();

router.get('/', holidayCtrl.getHolidays);

export default router;
