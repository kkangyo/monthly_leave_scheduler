import * as express from 'express';
import authCtrl from './auth.ctrl';
import requireAuth from '../module/requireAuth';

const router: express.Router = express.Router();

// 로그인은 인증 없이 공개
router.post('/login', authCtrl.login);
router.post('/superadmin-login', authCtrl.superadminLogin);

// 계정 생성/비밀번호 재설정은 로그인(매장 관리자/슈퍼관리자, 또는 본인) 필요
router.post('/accounts', requireAuth, authCtrl.createAccount);
router.patch('/accounts/:agentId', requireAuth, authCtrl.resetPassword);

export default router;
