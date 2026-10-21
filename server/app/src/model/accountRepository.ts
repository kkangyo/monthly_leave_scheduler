import crypto from 'crypto';
import { OkPacket } from 'mysql2';
import { AccountEntity } from '../apis/auth/authEntities';
import db from '../config/db';
import { ServerError } from '../service/error';

class AccountRepository {
  async createAccount(
    storeId: string,
    agentId: string,
    loginId: string,
    passwordHash: string
  ): Promise<string> {
    let conn;
    try {
      conn = await db.getConnection();
      const accountId = crypto.randomUUID();
      await conn.execute(
        `INSERT INTO accounts (account_id, store_id, agent_information_id, login_id, password_hash)
         VALUES (?, ?, ?, ?, ?);`,
        [accountId, storeId, agentId, loginId, passwordHash]
      );
      return accountId;
    } catch (error) {
      throw new ServerError('Database Error Occurred');
    } finally {
      conn?.release();
    }
  }

  async getAccountByStoreAndLoginId(
    storeId: string,
    loginId: string
  ): Promise<AccountEntity | undefined> {
    let conn;
    try {
      conn = await db.getConnection();
      const [rows] = await conn.execute<AccountEntity[]>(
        `SELECT account_id, store_id, agent_information_id, login_id, password_hash
           FROM accounts WHERE store_id = ? AND login_id = ?;`,
        [storeId, loginId]
      );
      return rows[0];
    } catch (error) {
      throw new ServerError('Database Error Occurred');
    } finally {
      conn?.release();
    }
  }

  async getAccountByAgentId(agentId: string): Promise<AccountEntity | undefined> {
    let conn;
    try {
      conn = await db.getConnection();
      const [rows] = await conn.execute<AccountEntity[]>(
        `SELECT account_id, store_id, agent_information_id, login_id, password_hash
           FROM accounts WHERE agent_information_id = ?;`,
        [agentId]
      );
      return rows[0];
    } catch (error) {
      throw new ServerError('Database Error Occurred');
    } finally {
      conn?.release();
    }
  }

  async updatePassword(accountId: string, passwordHash: string): Promise<number> {
    let conn;
    try {
      conn = await db.getConnection();
      const [row] = await conn.execute<OkPacket>(
        'UPDATE accounts SET password_hash = ? WHERE account_id = ?;',
        [passwordHash, accountId]
      );
      return row.affectedRows;
    } catch (error) {
      throw new ServerError('Database Error Occurred');
    } finally {
      conn?.release();
    }
  }

  // 직원 레코드를 삭제할 때 같이 정리 — 삭제된 직원의 옛 계정으로 더는 로그인 못 하게.
  async deleteAccountByAgentId(agentId: string): Promise<number> {
    let conn;
    try {
      conn = await db.getConnection();
      const [row] = await conn.execute<OkPacket>(
        'DELETE FROM accounts WHERE agent_information_id = ?;',
        [agentId]
      );
      return row.affectedRows;
    } catch (error) {
      throw new ServerError('Database Error Occurred');
    } finally {
      conn?.release();
    }
  }
}

export default AccountRepository;
