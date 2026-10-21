import { Request, Response } from 'express';
import Agentinfo from '../../service/agentinfo';
import AgentinfoRepository from '../../model/agentinfoRepository';
import AccountRepository from '../../model/accountRepository';
import { BadRequestError } from '../../service/error';
import { resolveStoreId } from '../module/requireAuth';
import assertStoreAdmin from '../module/requireStoreAdmin';
import errorResposne from '../module/error';

const createAgentinfo = async (req: Request, res: Response) => {
  const RequestAgentinfo = Object.assign(req.body);

  try {
    console.log('Enter createAgentinfo');
    const repo = new AgentinfoRepository();
    const storeId = resolveStoreId(req);
    await assertStoreAdmin(req, repo);

    if (RequestAgentinfo.name?.length === 0)
      req.body.name = '익명';

    const agentinfo = new Agentinfo(repo, RequestAgentinfo);

    const response = await agentinfo.createAgent(storeId);

    if (response)
      return res.status(201).json({
        statusCode: 201,
        commentId: response,
        msg: 'Successful Agent info creation',
      });
  } catch (err) {
    return errorResposne(err, res);
  }
};

const updateAgentinfoById = async (req: Request, res: Response) => {
  const { id: AgentId } = req.params;

  const RequestAgentinfo = Object.assign(req.body);

  try {
    console.log('Enter updateAgentinfoById');
    const repo = new AgentinfoRepository();
    const storeId = resolveStoreId(req);
    const agentinfo = new Agentinfo(repo, RequestAgentinfo);

    // 관리자는 전체 필드 수정, 본인은 자기 레코드의 원하는휴일/연차신청/필수근무일만 수정 가능
    const isSelf = req.auth?.kind === 'store' && req.auth.agentId === String(AgentId);
    let response;
    if (isSelf) {
      response = await agentinfo.updateOwnAgentinfo(String(AgentId), storeId);
    } else {
      await assertStoreAdmin(req, repo);
      response = await agentinfo.updateAgentinfoById(String(AgentId), storeId);
    }

    if (!response.success)
      return res.status(401).json({ statusCode: 401, msg: response.msg });
    return res.status(200).json({ statusCode: 200, msg: response.msg });
  } catch (err) {
    return errorResposne(err, res);
  }
};

const getAgentCount = async (req: Request, res: Response) => {
  try {
    console.log('Enter getAgentCount');
    const storeId = resolveStoreId(req);
    const agentinfo = new Agentinfo(new AgentinfoRepository());
    const response = await agentinfo.getAgentCount(storeId);

    return res.status(200).json({ statusCode: 200, response });
  } catch (err) {
    return errorResposne(err, res);
  }
};

const getAgentinfos = async (req: Request, res: Response) => {
  try {
    console.log('Enter getAgentinfos');
    const storeId = resolveStoreId(req);
    const agentinfo = new Agentinfo(new AgentinfoRepository());

    const response = await agentinfo.getAgentinfos(storeId);

    return res.status(200).json({ statusCode: 200, ...response });
  } catch (err) {
    return errorResposne(err, res);
  }
};

const confirmMonthlySchedule = async (req: Request, res: Response) => {
  try {
    console.log('Enter confirmMonthlySchedule');
    const repo = new AgentinfoRepository();
    const storeId = resolveStoreId(req);
    await assertStoreAdmin(req, repo);
    const agentinfo = new Agentinfo(repo);

    const response = await agentinfo.confirmMonthlySchedule(storeId, req.body);

    return res.status(200).json({ statusCode: 200, ...response });
  } catch (err) {
    return errorResposne(err, res);
  }
};

const getMonthlySchedule = async (req: Request, res: Response) => {
  try {
    console.log('Enter getMonthlySchedule');
    const storeId = resolveStoreId(req);
    const month = String(req.query.month ?? '');
    const agentinfo = new Agentinfo(new AgentinfoRepository());

    const response = await agentinfo.getMonthlySchedule(storeId, month);

    return res.status(200).json({ statusCode: 200, ...response });
  } catch (err) {
    return errorResposne(err, res);
  }
};

const getAppSettings = async (req: Request, res: Response) => {
  try {
    console.log('Enter getAppSettings');
    const storeId = resolveStoreId(req);
    const agentinfo = new Agentinfo(new AgentinfoRepository());

    const response = await agentinfo.getAppSettings(storeId);

    return res.status(200).json({ statusCode: 200, ...response });
  } catch (err) {
    return errorResposne(err, res);
  }
};

const updateAppSettings = async (req: Request, res: Response) => {
  try {
    console.log('Enter updateAppSettings');
    const repo = new AgentinfoRepository();
    const storeId = resolveStoreId(req);
    await assertStoreAdmin(req, repo);
    const agentinfo = new Agentinfo(repo);

    const response = await agentinfo.updateAppSettings(storeId, req.body);

    return res.status(200).json({ statusCode: 200, ...response });
  } catch (err) {
    return errorResposne(err, res);
  }
};

const resetMonthlySchedule = async (req: Request, res: Response) => {
  try {
    console.log('Enter resetMonthlySchedule');
    const repo = new AgentinfoRepository();
    const storeId = resolveStoreId(req);
    await assertStoreAdmin(req, repo);
    const agentinfo = new Agentinfo(repo);

    const response = await agentinfo.resetMonthlySchedule(storeId);

    return res.status(200).json({ statusCode: 200, ...response });
  } catch (err) {
    return errorResposne(err, res);
  }
};

const getAnnualLeaveUsage = async (req: Request, res: Response) => {
  try {
    console.log('Enter getAnnualLeaveUsage');
    const storeId = resolveStoreId(req);
    const month = String(req.query.month ?? '');
    const agentinfo = new Agentinfo(new AgentinfoRepository());

    const response = await agentinfo.getAnnualLeaveUsage(storeId, month);

    return res.status(200).json({ statusCode: 200, ...response });
  } catch (err) {
    return errorResposne(err, res);
  }
};

const deleteAgentinfoById = async (req: Request, res: Response) => {
  try {
    console.log('Enter deleteAgentinfoById');
    const AgentId = req.params.id;

    if (!AgentId) throw new BadRequestError('id params is undefined');

    const repo = new AgentinfoRepository();
    const storeId = resolveStoreId(req);
    await assertStoreAdmin(req, repo);

    const agentinfo = new Agentinfo(repo);

    const response = await agentinfo.deleteAgentinfoById(
      String(AgentId),
      storeId
    );

    if (response) {
      // 삭제된 직원의 로그인 계정도 같이 정리 (있었다면)
      await new AccountRepository().deleteAccountByAgentId(String(AgentId));
      return res.status(200).json({
        statusCode: 200,
        msg: 'Successful deletion of agent info',
      });
    }
  } catch (err) {
    return errorResposne(err, res);
  }
};

export = {
  createAgentinfo,
  updateAgentinfoById,
  getAgentCount,
  getAgentinfos,
  deleteAgentinfoById,
  confirmMonthlySchedule,
  getMonthlySchedule,
  getAnnualLeaveUsage,
  getAppSettings,
  updateAppSettings,
  resetMonthlySchedule,
};
