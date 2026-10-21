import * as express from 'express';
import superadminCtrl from './superadmin.ctrl';

const router: express.Router = express.Router();

router.post('/stores', superadminCtrl.createStore);
router.get('/stores', superadminCtrl.listStores);
router.delete('/stores/:storeId', superadminCtrl.deleteStore);

export default router;
