import {
  AgentinfoDto,
  AgentinfoEntity,
  ConfirmScheduleBody,
  LeaveType,
  MonthlyLeaveRow,
} from '../apis/agentinfo/agentinfo';
import AgentinfoRepository from '../model/agentinfoRepository';
import { BadRequestError, NotFoundError, ServerError } from './error';

interface Response {
  success: boolean;
  msg: string;
}

class Agentinfo {
  private readonly agentinfoRepository: AgentinfoRepository;
  readonly body;
  constructor(agentinfoRepository: AgentinfoRepository, body?: any) {
    this.agentinfoRepository = agentinfoRepository;
    this.body = body;
  }

  async createAgent(): Promise<string> {
    const { body } = this;

    const agentdata: AgentinfoDto = {
      name: body.name,
      joblevel: body.joblevel,
      description: body.description,
      annualleave: body.annualleave,
      mandatoryworkday: body.mandatoryworkday ?? '',
    };

    const commentId = await this.agentinfoRepository.createAgent(
      agentdata
    );

    if (commentId) return commentId;
    throw new ServerError('Interver Server Error');
  }
  
  async updateAgentinfoById(agentinfoId: string): Promise<Response> {
    const { name, joblevel, description, annualleave, mandatoryworkday }: AgentinfoDto =
      this.body;

    const agentinfo = await this.agentinfoRepository.getAgentinfoById(
      agentinfoId
    );

    if (!agentinfo) throw new NotFoundError('No data exists');

    await this.agentinfoRepository.updateAgentinfo(
      agentinfoId,
      name,
      joblevel,
      description,
      annualleave,
      mandatoryworkday ?? ''
    );

    return { success: true, msg: 'Agent info update complete' };
  }

  async getAgentCount(): Promise<number> {
    const agentcount = await this.agentinfoRepository.getAgentCount();

    return agentcount;
  }

  async getAgentinfos(): Promise<{ agentinfos: AgentinfoEntity[] }> {
    const agentinfos = await this.agentinfoRepository.getAgentinfos();

    return { agentinfos };
  }

  // 월 스케줄 확정: 인원별로 해당 월의 확정 휴일/연차를 통째로 교체 저장
  async confirmMonthlySchedule(
    body: ConfirmScheduleBody
  ): Promise<{ success: boolean; count: number }> {
    const { scheduleMonth, entries } = body;

    if (!/^\d{4}-\d{2}$/.test(scheduleMonth ?? ''))
      throw new BadRequestError('scheduleMonth must be "YYYY-MM"');
    if (!Array.isArray(entries) || entries.length === 0)
      throw new BadRequestError('entries must be a non-empty array');

    const inMonth = (d: string) => d.startsWith(`${scheduleMonth}-`);
    const clean = (arr: unknown): string[] =>
      Array.isArray(arr)
        ? [...new Set(arr.map((v) => String(v).trim()).filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && inMonth(v)))]
        : [];

    for (const entry of entries) {
      if (!entry.agentId) throw new BadRequestError('entry.agentId is required');

      const annualSet = new Set(clean(entry.annualLeaveDates));
      const compSet = new Set(clean(entry.compLeaveDates));
      const allDates = new Set(clean(entry.leaveDates));
      annualSet.forEach((d) => allDates.add(d)); // 연차일도 휴무일에 포함
      compSet.forEach((d) => allDates.add(d)); // 대체휴무일도 휴무일에 포함

      const rows = [...allDates].map((date) => ({
        agentId: entry.agentId,
        scheduleMonth,
        leaveDate: date,
        leaveType: (annualSet.has(date)
          ? 'annual'
          : compSet.has(date)
          ? 'comp'
          : 'leave') as LeaveType,
      }));

      await this.agentinfoRepository.replaceAgentMonthLeaves(
        entry.agentId,
        scheduleMonth,
        rows
      );
    }

    return { success: true, count: entries.length };
  }

  // 특정 월('YYYY-MM')의 확정 휴일/연차 조회
  async getMonthlySchedule(
    month: string
  ): Promise<{ leaves: MonthlyLeaveRow[] }> {
    if (!/^\d{4}-\d{2}$/.test(month ?? ''))
      throw new BadRequestError('month must be "YYYY-MM"');

    const leaves = await this.agentinfoRepository.getMonthlyLeaves(month);

    return { leaves };
  }

  // 스케줄 초기화:
  //  - monthly_leaves 테이블 DROP 후 재생성 (확정 저장/연차 사용 기록 삭제)
  //  - 모든 직원의 '원하는 휴일' / '연차 신청' 입력값 비움 (이름/직무는 유지)
  async resetMonthlySchedule(): Promise<{ success: boolean; clearedAgents: number }> {
    await this.agentinfoRepository.ensureAgentSchema();
    await this.agentinfoRepository.resetMonthlyLeavesTable();
    const clearedAgents = await this.agentinfoRepository.clearAgentLeaveInputs();
    return { success: true, clearedAgents };
  }

  // 해당 연도 1월부터 지정한 달까지의 인원별 누적 사용 연차 수
  async getAnnualLeaveUsage(
    month: string
  ): Promise<{ usage: { [agentId: string]: number } }> {
    if (!/^\d{4}-\d{2}$/.test(month ?? ''))
      throw new BadRequestError('month must be "YYYY-MM"');

    const rows = await this.agentinfoRepository.getAnnualLeaveUsageUpToMonth(month);

    const usage: { [agentId: string]: number } = {};
    rows.forEach((r) => {
      usage[r.agent_information_id] = Number(r.used) || 0;
    });

    return { usage };
  }

  // 앱 전역 설정 조회: 저장된 JSON 문자열을 파싱해서 반환
  async getAppSettings(): Promise<{ settings: { [key: string]: unknown } }> {
    const rows = await this.agentinfoRepository.getAppSettings();

    const settings: { [key: string]: unknown } = {};
    rows.forEach((r) => {
      try {
        settings[r.setting_key] = JSON.parse(r.setting_value);
      } catch {
        settings[r.setting_key] = r.setting_value;
      }
    });

    return { settings };
  }

  // 앱 전역 설정 저장: body 의 각 키를 JSON 문자열로 upsert
  async updateAppSettings(
    body: { [key: string]: unknown }
  ): Promise<{ success: boolean; count: number }> {
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new BadRequestError('body must be an object of { key: value }');

    const keys = Object.keys(body);
    if (keys.length === 0)
      throw new BadRequestError('body must contain at least one setting');

    for (const key of keys) {
      if (!/^[a-zA-Z0-9_]{1,64}$/.test(key))
        throw new BadRequestError(`invalid setting key: ${key}`);
      await this.agentinfoRepository.upsertAppSetting(
        key,
        JSON.stringify(body[key])
      );
    }

    return { success: true, count: keys.length };
  }

  async deleteAgentinfoById(agentinfoId: string): Promise<boolean> {
    const agentdata = await this.agentinfoRepository.getAgentinfoById(
      agentinfoId
    );

    if (!agentdata) throw new NotFoundError('No data exists');

    const isDelete = await this.agentinfoRepository.deleteAgentinfoById(
      agentinfoId
    );

    if (isDelete) return true;
    throw new ServerError('Interver Server Error');
  }
}
export default Agentinfo;
