import { Request, Response } from 'express';
import AuthService from '../../service/auth';
import AgentinfoRepository from '../../model/agentinfoRepository';
import assertStoreAdmin from '../module/requireStoreAdmin';
import { resolveStoreId } from '../module/requireAuth';
import errorResposne from '../module/error';

const login = async (req: Request, res: Response) => {
  try {
    const { storeCode, loginId, password } = req.body;
    const result = await new AuthService().login(storeCode, loginId, password);
    return res.status(200).json({ statusCode: 200, ...result });
  } catch (err) {
    return errorResposne(err, res);
  }
};

const superadminLogin = async (req: Request, res: Response) => {
  try {
    const { loginId, password } = req.body;
    const result = await new AuthService().superadminLogin(loginId, password);
    return res.status(200).json({ statusCode: 200, ...result });
  } catch (err) {
    return errorResposne(err, res);
  }
};

// 매장 관리자(또는 슈퍼관리자)가 특정 직원에게 로그인 계정을 발급
const createAccount = async (req: Request, res: Response) => {
  try {
    const repo = new AgentinfoRepository();
    const storeId = resolveStoreId(req);
    await assertStoreAdmin(req, repo);

    const { agentId, loginId, password } = req.body;
    const result = await new AuthService().createAccount(storeId, agentId, loginId, password);
    return res.status(201).json({ statusCode: 201, ...result });
  } catch (err) {
    return errorResposne(err, res);
  }
};

// 비밀번호 재설정: 관리자는 아무 직원 것이나, 그 외엔 본인 것만
const resetPassword = async (req: Request, res: Response) => {
  try {
    const repo = new AgentinfoRepository();
    const storeId = resolveStoreId(req);
    const agentId = req.params.agentId;

    const isSelf = req.auth?.kind === 'store' && req.auth.agentId === agentId;
    if (!isSelf) await assertStoreAdmin(req, repo);

    const { password } = req.body;
    await new AuthService().resetPassword(storeId, agentId, password);
    return res.status(200).json({ statusCode: 200, msg: 'password updated' });
  } catch (err) {
    return errorResposne(err, res);
  }
};

export = { login, superadminLogin, createAccount, resetPassword };
