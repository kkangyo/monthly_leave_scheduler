import { RowDataPacket } from 'mysql2';
import db from '../config/db';
import { ServerError } from '../service/error';

export interface HolidayEntity extends RowDataPacket {
  holiday_date: string; // 'YYYY-MM-DD'
  name: string;
}

class HolidayRepository {
  // 기존 DB 마이그레이션: 공휴일 테이블이 없으면 생성 (create_table.sql 은 DB 최초 생성 시에만 실행되므로)
  async ensureHolidaySchema(): Promise<void> {
    let conn;
    try {
      conn = await db.getConnection();
      await conn.query(
        `CREATE TABLE IF NOT EXISTS public_holidays (
           holiday_date DATE NOT NULL,
           name VARCHAR(64) NOT NULL,
           updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
           PRIMARY KEY (holiday_date)
         );`
      );
    } catch (error) {
      throw new ServerError('Database Error Occurred');
    } finally {
      conn?.release();
    }
  }

  // [from, to] 기간('YYYY-MM-DD')의 공휴일 조회
  async getHolidays(from: string, to: string): Promise<HolidayEntity[]> {
    let conn;
    try {
      conn = await db.getConnection();
      const [rows] = await conn.execute<HolidayEntity[]>(
        `SELECT DATE_FORMAT(holiday_date, '%Y-%m-%d') AS holiday_date, name
           FROM public_holidays
          WHERE holiday_date BETWEEN ? AND ?
          ORDER BY holiday_date;`,
        [from, to]
      );
      return rows;
    } catch (error) {
      throw new ServerError('Database Error Occurred');
    } finally {
      conn?.release();
    }
  }

  // 연도별 저장 건수 { 2026: 22, ... }
  async countByYear(years: number[]): Promise<{ [year: number]: number }> {
    let conn;
    try {
      conn = await db.getConnection();
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT YEAR(holiday_date) AS y, COUNT(*) AS cnt
           FROM public_holidays
          WHERE YEAR(holiday_date) IN (?)
          GROUP BY YEAR(holiday_date);`,
        [years]
      );
      const result: { [year: number]: number } = {};
      years.forEach((y) => (result[y] = 0));
      rows.forEach((r) => (result[Number(r.y)] = Number(r.cnt)));
      return result;
    } catch (error) {
      throw new ServerError('Database Error Occurred');
    } finally {
      conn?.release();
    }
  }

  // [from, to] 기간의 공휴일을 통째로 교체 (트랜잭션)
  async replaceHolidays(
    from: string,
    to: string,
    holidays: { date: string; name: string }[]
  ): Promise<void> {
    let conn;
    try {
      conn = await db.getConnection();
      await conn.beginTransaction();
      await conn.execute(
        'DELETE FROM public_holidays WHERE holiday_date BETWEEN ? AND ?;',
        [from, to]
      );
      if (holidays.length > 0) {
        await conn.query(
          'INSERT INTO public_holidays (holiday_date, name) VALUES ?;',
          [holidays.map((h) => [h.date, h.name])]
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

  // 보관 범위(minYear~maxYear) 밖의 공휴일 삭제
  async pruneOutsideYears(minYear: number, maxYear: number): Promise<void> {
    let conn;
    try {
      conn = await db.getConnection();
      await conn.execute(
        'DELETE FROM public_holidays WHERE holiday_date < ? OR holiday_date > ?;',
        [`${minYear}-01-01`, `${maxYear}-12-31`]
      );
    } catch (error) {
      throw new ServerError('Database Error Occurred');
    } finally {
      conn?.release();
    }
  }
}

export default HolidayRepository;
