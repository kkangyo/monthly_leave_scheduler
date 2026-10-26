import { RowDataPacket } from 'mysql2';

export interface AgentinfoDto {
  name: string;
  joblevel: string;
  description: string;
  annualleave: string;
  mandatoryworkday: string;
  leavedays: number; // 월 휴무 일수 (연차 제외, 기본 8)
  officialleave: string; // 공가 신청 "YYYY-MM-DD, ..." (개인 연차 소진 없음)
}

export interface AgentinfoEntity extends RowDataPacket {
  id: string;
  name: string;
  joblevel: string;
  description: string;
  annualleave: string;
  mandatory_workday: string;
  leave_days: number;
  official_leave: string;
}

export type LeaveType = 'leave' | 'annual' | 'comp' | 'official'; // official = 공가

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
    officialLeaveDates?: string[];
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