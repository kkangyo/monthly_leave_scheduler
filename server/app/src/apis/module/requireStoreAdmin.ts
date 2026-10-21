import { Request } from 'express';
import AgentinfoRepository from '../../model/agentinfoRepository';
import { ForbiddenError, UnauthorizedError } from '../../service/error';

// 매장 관리자 판별: job_level 이 점장/2층 부점장이거나, 별도로 "휴무 관리" 권한을 받은 직원.
const ADMIN_JOB_LEVELS = ['점장', '2층 부점장'];

// 지금 요청이 매장 관리자(또는 슈퍼관리자)인지 확인한다. 아니면 ForbiddenError 를 던진다.
// admin 여부를 토큰에 넣지 않고 매 요청마다 DB 최신값으로 판별하므로, 권한을 바꾸면 재로그인
// 없이 바로 반영된다.
export const assertStoreAdmin = async (
  req: Request,
  repo: AgentinfoRepository
): Promise<void> => {
  if (!req.auth) throw new UnauthorizedError('인증 정보가 없습니다');
  if (req.auth.kind === 'superadmin') return; // 슈퍼관리자는 항상 통과

  const agent = await repo.getAgentinfoById(req.auth.agentId);
  if (!agent) throw new ForbiddenError('권한이 없습니다');

  const isAdmin = ADMIN_JOB_LEVELS.includes(String(agent.job_level ?? '')) || !!agent.is_schedule_manager;
  if (!isAdmin) throw new ForbiddenError('매장 관리자만 가능한 작업입니다');
};

export default assertStoreAdmin;
