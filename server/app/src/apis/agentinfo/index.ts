import * as express from 'express';
import agentinfoCtrl from './agentinfo.ctrl';
const router: express.Router = express.Router();

router.get('/count', agentinfoCtrl.getAgentCount);
router.get('/infos', agentinfoCtrl.getAgentinfos);
router.post('/infos', agentinfoCtrl.createAgentinfo);
router.get('/annual-leave/usage', agentinfoCtrl.getAnnualLeaveUsage);
router.get('/settings', agentinfoCtrl.getAppSettings);
router.put('/settings', agentinfoCtrl.updateAppSettings);
router.get('/schedule', agentinfoCtrl.getMonthlySchedule);
router.post('/schedule/confirm', agentinfoCtrl.confirmMonthlySchedule);
router.post('/schedule/reset', agentinfoCtrl.resetMonthlySchedule);
router.delete('/infos/:id', agentinfoCtrl.deleteAgentinfoById);
router.patch(
    '/infos/:id',
    agentinfoCtrl.updateAgentinfoById
  );
export default router;
