import { RowDataPacket } from 'mysql2';

export interface AgentinfoDto {
  name: string;
  joblevel: string;
  description: string;
  annualleave: string;
  mandatoryworkday: string;
  isschedulemanager?: boolean;
}

export interface AgentinfoEntity extends RowDataPacket {
  id: string;
  name: string;
  joblevel: string;
  description: string;
  annualleave: string;
  mandatory_workday: string;
  is_schedule_manager?: number; // 0/1 — "휴무 관리" 권한 플래그(직무와 무관하게 매장 관리자 지정)
  store_id?: string; // getAgentinfoById()의 SELECT * 에만 포함됨(getAgentinfos()는 명시적 컬럼만 선택)
  job_level?: string; // 위와 동일 이유로 SELECT * 원본에는 joblevel 이 아니라 job_level 로 옴
}

export type LeaveType = 'leave' | 'annual' | 'comp';

export interface MonthlyLeaveDto {
  agentId: string;
  scheduleMonth: string; // 'YYYY-MM'
  leaveDate: string; // 'YYYY-MM-DD'
  leaveType: LeaveType;
}

export interface ConfirmScheduleBody {
  scheduleMonth: string;
  entries: {
    agentId: string;
    leaveDates: string[];
    annualLeaveDates: string[];
    compLeaveDates?: string[];
  }[];
}

export interface MonthlyLeaveRow extends RowDataPacket {
  agentId: string;
  name: string;
  jobLevel: string;
  date: string; // 'YYYY-MM-DD'
  type: LeaveType;
}

export interface AnnualLeaveUsageEntity extends RowDataPacket {
  agent_information_id: string;
  used: number;
}

export interface AppSettingEntity extends RowDataPacket {
  setting_key: string;
  setting_value: string;
}