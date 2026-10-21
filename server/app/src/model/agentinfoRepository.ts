import { OkPacket, ResultSetHeader, RowDataPacket } from 'mysql2';
import {
  AgentinfoEntity, AgentinfoDto, MonthlyLeaveDto, MonthlyLeaveRow, AnnualLeaveUsageEntity, AppSettingEntity,
} from '../apis/agentinfo/agentinfo';
import db from '../config/db';
import { ServerError } from '../service/error';

class AgentinfoRepository {

  private async columnExists(conn: any, table: string, column: string): Promise<boolean> {
    const [rows]: [any[], any] = await conn.query(
      `SELECT COUNT(*) AS cnt
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?;`,
      [table, column]
    );
    return !!rows[0] && Number(rows[0].cnt) > 0;
  }

  // 기존 DB 마이그레이션 (부팅 시 1회, information_schema 확인 후 필요하면만 ALTER):
  //  - agent_informations.mandatory_workday 컬럼 추가
  //  - monthly_leaves.leave_type ENUM 에 'comp'(대체휴무) 추가
  //  - stores/accounts 테이블, 각 테이블의 store_id 컬럼, agent_informations.is_schedule_manager 추가
  //  - 기존(단일 매장) 데이터를 기본 매장 하나로 백필
  async ensureAgentSchema(): Promise<void> {
    let conn;
    try {
      conn = await db.getConnection();

      if (!(await this.columnExists(conn, 'agent_informations', 'mandatory_workday'))) {
        await conn.query(
          `ALTER TABLE agent_informations
             ADD COLUMN mandatory_workday varchar(255) NOT NULL DEFAULT '';`
        );
      }

      const [enumRows]: [any[], any] = await conn.query(
        `SELECT COLUMN_TYPE AS t
           FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'monthly_leaves'
            AND COLUMN_NAME = 'leave_type';`
      );
      if (enumRows[0] && !String(enumRows[0].t).includes("'comp'")) {
        await conn.query(
          `ALTER TABLE monthly_leaves
             MODIFY COLUMN leave_type ENUM('leave','annual','comp') NOT NULL DEFAULT 'leave';`
        );
      }

      // ── 계정/매장 관리 기능: stores / accounts 테이블 ──
      await conn.query(`
        CREATE TABLE IF NOT EXISTS \`stores\` (
          \`store_id\` CHAR(36) NOT NULL,
          \`store_code\` VARCHAR(50) NOT NULL,
          \`store_name\` VARCHAR(100) NOT NULL,
          \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`store_id\`),
          UNIQUE KEY \`uq_store_code\` (\`store_code\`)
        );`);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS \`accounts\` (
          \`account_id\` CHAR(36) NOT NULL,
          \`store_id\` CHAR(36) NOT NULL,
          \`agent_information_id\` CHAR(36) NOT NULL,
          \`login_id\` VARCHAR(50) NOT NULL,
          \`password_hash\` VARCHAR(255) NOT NULL,
          \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`account_id\`),
          UNIQUE KEY \`uq_store_login\` (\`store_id\`, \`login_id\`),
          UNIQUE KEY \`uq_agent_account\` (\`agent_information_id\`)
        );`);

      if (!(await this.columnExists(conn, 'agent_informations', 'is_schedule_manager'))) {
        await conn.query(
          `ALTER TABLE agent_informations
             ADD COLUMN is_schedule_manager TINYINT(1) NOT NULL DEFAULT 0;`
        );
      }

      // store_id 컬럼: 기존 데이터가 있을 수 있어 일단 nullable 로 추가 → 백필 → NOT NULL 로 조인다.
      let needsBackfill = false;
      if (!(await this.columnExists(conn, 'agent_informations', 'store_id'))) {
        await conn.query('ALTER TABLE agent_informations ADD COLUMN store_id CHAR(36) NULL;');
        needsBackfill = true;
      }
      if (!(await this.columnExists(conn, 'monthly_leaves', 'store_id'))) {
        await conn.query('ALTER TABLE monthly_leaves ADD COLUMN store_id CHAR(36) NULL;');
      }
      if (!(await this.columnExists(conn, 'app_settings', 'store_id'))) {
        await conn.query('ALTER TABLE app_settings ADD COLUMN store_id CHAR(36) NULL;');
      }

      if (needsBackfill) {
        const defaultStoreCode = process.env.DEFAULT_STORE_CODE || 'default';
        const [existing]: [any[], any] = await conn.query(
          'SELECT store_id FROM stores WHERE store_code = ?;',
          [defaultStoreCode]
        );
        let defaultStoreId: string = existing[0]?.store_id;
        if (!defaultStoreId) {
          const [idRows]: [any[], any] = await conn.query('SELECT UUID() AS id;');
          defaultStoreId = idRows[0].id;
          await conn.query(
            'INSERT INTO stores (store_id, store_code, store_name) VALUES (?, ?, ?);',
            [defaultStoreId, defaultStoreCode, '기존 매장']
          );
          console.log(
            `[migration] 기존 데이터를 기본 매장으로 백필했습니다: store_code="${defaultStoreCode}". ` +
            '이 매장의 첫 관리자 계정은 슈퍼관리자로 로그인해서 수동으로 생성해야 합니다.'
          );
        }

        await conn.query('UPDATE agent_informations SET store_id = ? WHERE store_id IS NULL;', [defaultStoreId]);
        await conn.query('UPDATE monthly_leaves SET store_id = ? WHERE store_id IS NULL;', [defaultStoreId]);
        await conn.query('UPDATE app_settings SET store_id = ? WHERE store_id IS NULL;', [defaultStoreId]);
      }

      // 백필이 끝났으면(또는 처음부터 비어있던 테이블이면) NOT NULL 로 조인다.
      const [aiNullable]: [any[], any] = await conn.query(
        `SELECT IS_NULLABLE AS n FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_informations' AND COLUMN_NAME = 'store_id';`
      );
      if (aiNullable[0]?.n === 'YES') {
        await conn.query('ALTER TABLE agent_informations MODIFY COLUMN store_id CHAR(36) NOT NULL;');
      }
      const [mlNullable]: [any[], any] = await conn.query(
        `SELECT IS_NULLABLE AS n FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'monthly_leaves' AND COLUMN_NAME = 'store_id';`
      );
      if (mlNullable[0]?.n === 'YES') {
        await conn.query('ALTER TABLE monthly_leaves MODIFY COLUMN store_id CHAR(36) NOT NULL;');
      }
      // app_settings 는 PK 를 (store_id, setting_key) 복합키로 바꿔야 해서 별도 처리.
      const [pkRows]: [any[], any] = await conn.query(
        `SELECT COLUMN_NAME AS col FROM information_schema.KEY_COLUMN_USAGE
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_settings' AND CONSTRAINT_NAME = 'PRIMARY';`
      );
      const pkCols: string[] = pkRows.map((r: any) => r.col);
      if (!(pkCols.length === 2 && pkCols.includes('store_id') && pkCols.includes('setting_key'))) {
        await conn.query('ALTER TABLE app_settings MODIFY COLUMN store_id CHAR(36) NOT NULL;');
        await conn.query('ALTER TABLE app_settings DROP PRIMARY KEY, ADD PRIMARY KEY (store_id, setting_key);');
      }
    } catch (error) {
      throw new ServerError('Database Error Occurred');
    } finally {
      conn?.release();
    }
  }

  async createAgent(
    storeId: string,
    {
      name,
      joblevel,
      description,
      annualleave,
      mandatoryworkday,
      isschedulemanager,
    }: AgentinfoDto
  ): Promise<string> {
    let conn;
    try {
      conn = await db.getConnection();

      const query = `
        INSERT INTO agent_informations
          (agent_information_id, store_id, name, job_level, description, annualleave, mandatory_workday, is_schedule_manager)
        VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?);`;

      await conn.execute<ResultSetHeader>(query, [
        storeId,
        name,
        joblevel,
        description,
        annualleave,
        mandatoryworkday ?? '',
        isschedulemanager ? 1 : 0,
      ]);

      return "true";
    } catch (error) {
      throw new ServerError('Database Error Occurred');
    } finally {
      conn?.release();
    }
  }

  async getAgentinfoById(
    agentId: string
  ): Promise<AgentinfoEntity> {
    let conn;
    try {
      conn = await db.getConnection();

      const query = `SELECT * FROM agent_informations WHERE agent_information_id = ?;`;

      const [row] = await conn.execute<AgentinfoEntity[]>(query, [
        agentId,
      ]);

      return row[0];
    } catch (error) {
      throw new ServerError('Database Error Occurred');
    } finally {
      conn?.release();
    }
  }

  async updateAgentinfo(
    agentId: string,
    storeId: string,
    name: string,
    joblevel: string,
    description: string,
    annualleave: string,
    mandatoryworkday: string,
    isschedulemanager?: boolean
  ): Promise<number> {
    let conn;
    try {
      conn = await db.getConnection();

      const query = `
        UPDATE agent_informations
           SET name = ?, job_level = ?, description = ?, annualleave = ?, mandatory_workday = ?, is_schedule_manager = ?
         WHERE agent_information_id = ? AND store_id = ?`;

      const [row] = await conn.execute<OkPacket>(query, [
        name,
        joblevel,
        description,
        annualleave,
        mandatoryworkday ?? '',
        isschedulemanager ? 1 : 0,
        agentId,
        storeId,
      ]);

      return row.affectedRows;
    } catch (error) {
      throw new ServerError('Database Error Occurred');
    } finally {
      conn?.release();
    }
  }

  // 본인 자기 레코드의 원하는휴일/연차신청/필수근무일만 수정 (이름/직무/관리자 플래그는 건드리지 않음)
  async updateOwnLeaveFields(
    agentId: string,
    storeId: string,
    description: string,
    annualleave: string,
    mandatoryworkday: string
  ): Promise<number> {
    let conn;
    try {
      conn = await db.getConnection();

      const query = `
        UPDATE agent_informations
           SET description = ?, annualleave = ?, mandatory_workday = ?
         WHERE agent_information_id = ? AND store_id = ?`;

      const [row] = await conn.execute<OkPacket>(query, [
        description,
        annualleave,
        mandatoryworkday ?? '',
        agentId,
        storeId,
      ]);

      return row.affectedRows;
    } catch (error) {
      throw new ServerError('Database Error Occurred');
    } finally {
      conn?.release();
    }
  }

  async getAgentCount(storeId: string): Promise<number> {
    let conn;
    try {
      conn = await db.getConnection();

      const query = `
        SELECT COUNT(*) AS row_count FROM agent_informations WHERE store_id = ?;`;

        const [rows]: [any[], any] = await conn.execute(query, [storeId]);

        return rows[0].row_count;
    } catch (error) {
      throw new ServerError('Database Error Occurred');
    } finally {
      conn?.release();
    }
  }

  async getAgentinfos(storeId: string): Promise<AgentinfoEntity[]> {
    let conn;
    try {
      conn = await db.getConnection();

      const query = `
        SELECT agent_information_id AS id, name, job_level, description, annualleave, mandatory_workday, is_schedule_manager
          FROM agent_informations WHERE store_id = ? ORDER BY created_at ASC;`;

      const [row] = await conn.execute<AgentinfoEntity[]>(query, [storeId]);

      return row;
    } catch (error) {
      throw new ServerError('Database Error Occurred');
    } finally {
      conn?.release();
    }
  }

  async deleteAgentinfoById(id: string, storeId: string): Promise<number> {
    let conn;
    try {
      conn = await db.getConnection();

      const query = 'DELETE FROM agent_informations WHERE agent_information_id=? AND store_id=?;';

      const [row] = await conn.execute<OkPacket>(query, [id, storeId]);

      return row.affectedRows;
    } catch (error) {
      throw new ServerError('Database Error Occurred');
    } finally {
      conn?.release();
    }
  }

  // 한 직원의 특정 월 확정 휴일/연차를 통째로 교체 (기존 행 삭제 후 재삽입)
  async replaceAgentMonthLeaves(
    agentId: string,
    storeId: string,
    scheduleMonth: string,
    rows: MonthlyLeaveDto[]
  ): Promise<void> {
    let conn;
    try {
      conn = await db.getConnection();
      await conn.beginTransaction();

      await conn.execute(
        'DELETE FROM monthly_leaves WHERE agent_information_id = ? AND store_id = ? AND schedule_month = ?;',
        [agentId, storeId, scheduleMonth]
      );

      if (rows.length > 0) {
        const placeholders = rows.map(() => '(UUID(), ?, ?, ?, ?, ?)').join(', ');
        const params = rows.flatMap((r) => [
          storeId,
          r.agentId,
          r.scheduleMonth,
          r.leaveDate,
          r.leaveType,
        ]);
        await conn.query(
          `INSERT INTO monthly_leaves
             (monthly_leave_id, store_id, agent_information_id, schedule_month, leave_date, leave_type)
           VALUES ${placeholders};`,
          params
        );
      }

      await conn.commit();
    } catch (error) {
      await conn?.rollback();
      throw new ServerError('Database Error Occurred');
    } finally {
      conn?.release();
    }
  }

  // 특정 월('YYYY-MM')의 확정 휴일/연차 전체 (직원 이름/직무 포함)
  async getMonthlyLeaves(storeId: string, scheduleMonth: string): Promise<MonthlyLeaveRow[]> {
    let conn;
    try {
      conn = await db.getConnection();

      const query = `
        SELECT
          ml.agent_information_id AS agentId,
          a.name AS name,
          a.job_level AS jobLevel,
          DATE_FORMAT(ml.leave_date, '%Y-%m-%d') AS date,
          ml.leave_type AS type
        FROM monthly_leaves ml
        JOIN agent_informations a ON a.agent_information_id = ml.agent_information_id
        WHERE ml.store_id = ? AND ml.schedule_month = ?
        ORDER BY ml.leave_date ASC, a.name ASC;`;

      const [rows] = await conn.execute<MonthlyLeaveRow[]>(query, [storeId, scheduleMonth]);

      return rows;
    } catch (error) {
      throw new ServerError('Database Error Occurred');
    } finally {
      conn?.release();
    }
  }

  // 이 매장의 확정 휴일/연차 이력을 전부 삭제 (다른 매장 데이터는 건드리지 않음)
  async resetMonthlyLeavesTable(storeId: string): Promise<void> {
    let conn;
    try {
      conn = await db.getConnection();
      await conn.execute('DELETE FROM monthly_leaves WHERE store_id = ?;', [storeId]);
    } catch (error) {
      throw new ServerError('Database Error Occurred');
    } finally {
      conn?.release();
    }
  }

  // 이 매장 모든 직원의 '원하는 휴일'(description) / '연차 신청'(annualleave) / '필수 근무일'(mandatory_workday)
  // 입력값만 비움 (이름/직무는 유지)
  async clearAgentLeaveInputs(storeId: string): Promise<number> {
    let conn;
    try {
      conn = await db.getConnection();

      const query = `UPDATE agent_informations SET description = '', annualleave = '', mandatory_workday = '' WHERE store_id = ?;`;

      const [row] = await conn.execute<OkPacket>(query, [storeId]);

      return row.affectedRows;
    } catch (error) {
      throw new ServerError('Database Error Occurred');
    } finally {
      conn?.release();
    }
  }

  // 해당 연도 1월부터 지정한 달('YYYY-MM')까지의 인원별 누적 사용 연차 수 (이 매장만)
  async getAnnualLeaveUsageUpToMonth(
    storeId: string,
    month: string
  ): Promise<AnnualLeaveUsageEntity[]> {
    let conn;
    try {
      conn = await db.getConnection();

      const year = month.slice(0, 4);

      const query = `
        SELECT agent_information_id, COUNT(*) AS used
        FROM monthly_leaves
        WHERE store_id = ?
          AND leave_type = 'annual'
          AND schedule_month >= ?
          AND schedule_month <= ?
        GROUP BY agent_information_id;`;

      const [rows] = await conn.execute<AnnualLeaveUsageEntity[]>(query, [
        storeId,
        `${year}-01`,
        month,
      ]);

      return rows;
    } catch (error) {
      throw new ServerError('Database Error Occurred');
    } finally {
      conn?.release();
    }
  }

  // 앱 전역 설정 전체 조회 (키-값, 이 매장만)
  async getAppSettings(storeId: string): Promise<AppSettingEntity[]> {
    let conn;
    try {
      conn = await db.getConnection();

      const [rows] = await conn.execute<AppSettingEntity[]>(
        'SELECT setting_key, setting_value FROM app_settings WHERE store_id = ?;',
        [storeId]
      );

      return rows;
    } catch (error) {
      throw new ServerError('Database Error Occurred');
    } finally {
      conn?.release();
    }
  }

  // 앱 전역 설정 한 건 upsert (이 매장만)
  async upsertAppSetting(storeId: string, key: string, value: string): Promise<void> {
    let conn;
    try {
      conn = await db.getConnection();

      await conn.execute(
        `INSERT INTO app_settings (store_id, setting_key, setting_value)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);`,
        [storeId, key, value]
      );
    } catch (error) {
      throw new ServerError('Database Error Occurred');
    } finally {
      conn?.release();
    }
  }
}

export default AgentinfoRepository;
