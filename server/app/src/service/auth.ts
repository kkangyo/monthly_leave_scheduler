import bcrypt from 'bcryptjs';
import AccountRepository from '../model/accountRepository';
import StoreRepository from '../model/storeRepository';
import AgentinfoRepository from '../model/agentinfoRepository';
import { signToken } from './jwt';
import { BadRequestError, UnauthorizedError } from './error';

interface LoginResult {
  token: string;
  profile: {
    storeId: string;
    storeName: string;
    agentId: string;
    name: string;
    jobLevel: string;
    isAdmin: boolean;
    isSuperadmin?: boolean;
  };
}

// 매장 관리자 판별: job_level 이 점장/2층 부점장이거나, 별도 "휴무 관리" 권한을 받은 직원.
// apis/module/requireStoreAdmin.ts 와 동일 기준 — 한쪽만 바꾸고 잊어버리지 않도록 주의.
const ADMIN_JOB_LEVELS = ['점장', '2층 부점장'];

class AuthService {
  private readonly accountRepo = new AccountRepository();
  private readonly storeRepo = new StoreRepository();
  private readonly agentRepo = new AgentinfoRepository();

  async login(storeCode: string, loginId: string, password: string): Promise<LoginResult> {
    if (!storeCode || !loginId || !password)
      throw new BadRequestError('storeCode, loginId, password 가 모두 필요합니다');

    const store = await this.storeRepo.getStoreByCode(storeCode);
    if (!store) throw new UnauthorizedError('매장 코드 또는 로그인 정보가 올바르지 않습니다');

    // 슈퍼관리자도 같은 로그인 화면에서 "매장코드 + 슈퍼관리자 ID/PW"로 접속 — 그 매장을 대상으로
    // 슈퍼관리자 토큰을 발급하고, 클라이언트는 profile.storeId 를 X-Store-Id 헤더로 보낸다.
    if (await this.isSuperadminCredential(loginId, password)) {
      const token = signToken({ kind: 'superadmin', loginId });
      return {
        token,
        profile: {
          storeId: store.store_id,
          storeName: store.store_name,
          agentId: '',
          name: '슈퍼관리자',
          jobLevel: 'superadmin',
          isAdmin: true,
          isSuperadmin: true,
        },
      };
    }

    const account = await this.accountRepo.getAccountByStoreAndLoginId(store.store_id, loginId);
    if (!account) throw new UnauthorizedError('매장 코드 또는 로그인 정보가 올바르지 않습니다');

    const ok = await bcrypt.compare(password, account.password_hash);
    if (!ok) throw new UnauthorizedError('매장 코드 또는 로그인 정보가 올바르지 않습니다');

    const agent = await this.agentRepo.getAgentinfoById(account.agent_information_id);
    if (!agent) throw new UnauthorizedError('연결된 직원 정보를 찾을 수 없습니다');

    const jobLevel = String(agent.job_level ?? '');
    const isAdmin = ADMIN_JOB_LEVELS.includes(jobLevel) || !!agent.is_schedule_manager;

    const token = signToken({
      kind: 'store',
      accountId: account.account_id,
      storeId: store.store_id,
      agentId: account.agent_information_id,
      loginId: account.login_id,
    });

    return {
      token,
      profile: {
        storeId: store.store_id,
        storeName: store.store_name,
        agentId: account.agent_information_id,
        name: agent.name,
        jobLevel,
        isAdmin,
      },
    };
  }

  private async isSuperadminCredential(loginId: string, password: string): Promise<boolean> {
    const expectedLoginId = process.env.SUPERADMIN_LOGIN_ID || '';
    const expectedHash = process.env.SUPERADMIN_PASSWORD_HASH || '';
    if (!expectedLoginId || !expectedHash || loginId !== expectedLoginId) return false;
    return bcrypt.compare(password, expectedHash);
  }

  async superadminLogin(loginId: string, password: string): Promise<{ token: string }> {
    if (!loginId || !password) throw new BadRequestError('loginId, password 가 모두 필요합니다');

    const expectedLoginId = process.env.SUPERADMIN_LOGIN_ID || '';
    const expectedHash = process.env.SUPERADMIN_PASSWORD_HASH || '';
    if (!expectedLoginId || !expectedHash)
      throw new UnauthorizedError('슈퍼관리자 로그인이 설정되지 않았습니다');

    if (loginId !== expectedLoginId) throw new UnauthorizedError('로그인 정보가 올바르지 않습니다');
    const ok = await bcrypt.compare(password, expectedHash);
    if (!ok) throw new UnauthorizedError('로그인 정보가 올바르지 않습니다');

    const token = signToken({ kind: 'superadmin', loginId });
    return { token };
  }

  // 특정 직원에게 로그인 계정 발급 (이미 계정이 있으면 에러 — 비밀번호 재설정을 쓰도록 안내)
  async createAccount(
    storeId: string,
    agentId: string,
    loginId: string,
    password: string
  ): Promise<{ accountId: string }> {
    if (!agentId || !loginId || !password)
      throw new BadRequestError('agentId, loginId, password 가 모두 필요합니다');
    if (password.length < 8) throw new BadRequestError('비밀번호는 8자 이상이어야 합니다');

    const agent = await this.agentRepo.getAgentinfoById(agentId);
    if (!agent || agent.store_id !== storeId) throw new BadRequestError('해당 매장의 직원이 아닙니다');

    const existing = await this.accountRepo.getAccountByAgentId(agentId);
    if (existing) throw new BadRequestError('이미 계정이 있는 직원입니다 — 비밀번호 재설정을 이용하세요');

    const passwordHash = await bcrypt.hash(password, 10);
    const accountId = await this.accountRepo.createAccount(storeId, agentId, loginId, passwordHash);
    return { accountId };
  }

  // 비밀번호 재설정 — 관리자가 임의 직원 것을, 또는 본인이 자기 것을(ctrl 레이어에서 그 권한 분기)
  async resetPassword(storeId: string, agentId: string, password: string): Promise<void> {
    if (!password || password.length < 8) throw new BadRequestError('비밀번호는 8자 이상이어야 합니다');

    const account = await this.accountRepo.getAccountByAgentId(agentId);
    if (!account || account.store_id !== storeId) throw new BadRequestError('계정을 찾을 수 없습니다');

    const passwordHash = await bcrypt.hash(password, 10);
    await this.accountRepo.updatePassword(account.account_id, passwordHash);
  }
}

export default AuthService;
