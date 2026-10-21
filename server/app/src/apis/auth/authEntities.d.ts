import { RowDataPacket } from 'mysql2';

export interface StoreEntity extends RowDataPacket {
  store_id: string;
  store_code: string;
  store_name: string;
  // 슈퍼관리자 매장 목록(getAllStores)에서만 채워지는 값
  created_at?: string;
  agent_count?: number;
  account_count?: number;
}

export interface AccountEntity extends RowDataPacket {
  account_id: string;
  store_id: string;
  agent_information_id: string;
  login_id: string;
  password_hash: string;
}

export interface LoginBody {
  storeCode: string;
  loginId: string;
  password: string;
}

export interface SuperadminLoginBody {
  loginId: string;
  password: string;
}

export interface CreateAccountBody {
  agentId: string;
  loginId: string;
  password: string;
}

export interface ResetPasswordBody {
  password: string;
}
