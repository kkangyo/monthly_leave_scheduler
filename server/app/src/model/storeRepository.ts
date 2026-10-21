import crypto from 'crypto';
import { StoreEntity } from '../apis/auth/authEntities';
import db from '../config/db';
import { ServerError } from '../service/error';

class StoreRepository {
  async createStore(storeCode: string, storeName: string): Promise<string> {
    let conn;
    try {
      conn = await db.getConnection();
      const storeId = crypto.randomUUID();
      await conn.execute(
        'INSERT INTO stores (store_id, store_code, store_name) VALUES (?, ?, ?);',
        [storeId, storeCode, storeName]
      );
      return storeId;
    } catch (error) {
      throw new ServerError('Database Error Occurred');
    } finally {
      conn?.release();
    }
  }

  async getStoreByCode(storeCode: string): Promise<StoreEntity | undefined> {
    let conn;
    try {
      conn = await db.getConnection();
      const [rows] = await conn.execute<StoreEntity[]>(
        'SELECT store_id, store_code, store_name FROM stores WHERE store_code = ?;',
        [storeCode]
      );
      return rows[0];
    } catch (error) {
      throw new ServerError('Database Error Occurred');
    } finally {
      conn?.release();
    }
  }

  async getStoreById(storeId: string): Promise<StoreEntity | undefined> {
    let conn;
    try {
      conn = await db.getConnection();
      const [rows] = await conn.execute<StoreEntity[]>(
        'SELECT store_id, store_code, store_name FROM stores WHERE store_id = ?;',
        [storeId]
      );
      return rows[0];
    } catch (error) {
      throw new ServerError('Database Error Occurred');
    } finally {
      conn?.release();
    }
  }

  async getAllStores(): Promise<StoreEntity[]> {
    let conn;
    try {
      conn = await db.getConnection();
      const [rows] = await conn.execute<StoreEntity[]>(
        `SELECT s.store_id, s.store_code, s.store_name, s.created_at,
                (SELECT COUNT(*) FROM agent_informations a WHERE a.store_id = s.store_id) AS agent_count,
                (SELECT COUNT(*) FROM accounts c WHERE c.store_id = s.store_id) AS account_count
           FROM stores s ORDER BY s.created_at ASC;`
      );
      return rows;
    } catch (error) {
      throw new ServerError('Database Error Occurred');
    } finally {
      conn?.release();
    }
  }

  // 매장 삭제 — 파괴적: 소속 직원/계정/휴무 이력/설정을 전부 함께 지운다.
  async deleteStore(storeId: string): Promise<void> {
    let conn;
    try {
      conn = await db.getConnection();
      await conn.beginTransaction();
      await conn.execute('DELETE FROM accounts WHERE store_id = ?;', [storeId]);
      await conn.execute('DELETE FROM monthly_leaves WHERE store_id = ?;', [storeId]);
      await conn.execute('DELETE FROM app_settings WHERE store_id = ?;', [storeId]);
      await conn.execute('DELETE FROM agent_informations WHERE store_id = ?;', [storeId]);
      await conn.execute('DELETE FROM stores WHERE store_id = ?;', [storeId]);
      await conn.commit();
    } catch (error) {
      await conn?.rollback();
      throw new ServerError('Database Error Occurred');
    } finally {
      conn?.release();
    }
  }
}

export default StoreRepository;
