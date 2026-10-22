import https from 'https';
import HolidayRepository from '../model/holidayRepository';
import AgentinfoRepository from '../model/agentinfoRepository';

// 한국천문연구원 특일 정보 (공공데이터포털) — 공휴일 조회
const HOLIDAY_API_URL =
  'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo';
const SYNC_SETTING_KEY = 'holidaySync'; // app_settings 에 { lastSyncMonth: 'YYYY-MM' } 저장
const RETRY_COOLDOWN_MS = 60 * 60 * 1000; // API 실패 후 1시간 동안은 재호출하지 않음

// API 이름 → 화면 표기
const NAME_ALIASES: { [name: string]: string } = {
  '1월1일': '신정',
  기독탄신일: '성탄절',
};

// 같은 프로세스 안에서 동시에 여러 요청이 와도 API 동기화는 한 번만
let syncInFlight: Promise<void> | null = null;
let lastFailedAt = 0;

// 한국 시간 기준 오늘 (서버/컨테이너 타임존과 무관)
const kstToday = () => {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
};

const pad2 = (n: number) => String(n).padStart(2, '0');

const httpGetJson = (url: string): Promise<any> =>
  new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 10000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error(`holiday API returned non-JSON: ${body.slice(0, 200)}`));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('holiday API timeout')));
    req.on('error', reject);
  });

class Holiday {
  private readonly holidayRepository: HolidayRepository;
  private readonly agentinfoRepository: AgentinfoRepository;

  constructor(holidayRepository: HolidayRepository, agentinfoRepository: AgentinfoRepository) {
    this.holidayRepository = holidayRepository;
    this.agentinfoRepository = agentinfoRepository;
  }

  // 한 해 공휴일을 API 에서 받아 { date, name } 목록으로 정리
  //  - isHoliday='Y' 만 사용
  //  - 설날/추석은 API 가 3일 모두 같은 이름으로 주므로, 연속 구간의 가운데 날만 '설날'/'추석',
  //    나머지는 '설날 연휴'/'추석 연휴' 로 바꾼다 (알고리즘이 당일만 매장 전체 휴무로 처리)
  async fetchYear(year: number): Promise<{ date: string; name: string }[]> {
    const key = process.env.HOLIDAY_API_KEY;
    if (!key) throw new Error('HOLIDAY_API_KEY is not set');

    const url =
      `${HOLIDAY_API_URL}?ServiceKey=${encodeURIComponent(key)}` +
      `&solYear=${year}&numOfRows=100&_type=json`;
    const json = await httpGetJson(url);

    const header = json?.response?.header;
    if (header?.resultCode !== '00')
      throw new Error(`holiday API error: ${header?.resultCode} ${header?.resultMsg}`);

    const rawItems = json?.response?.body?.items?.item;
    const items: any[] = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

    const list = items
      .filter((it) => it.isHoliday === 'Y')
      .map((it) => {
        const s = String(it.locdate); // 20260216
        const date = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
        const name = String(it.dateName ?? '').trim();
        // '대체공휴일(기독탄신일)' 처럼 괄호 안 이름도 함께 바꾼다
        const aliased = Object.keys(NAME_ALIASES).reduce(
          (acc, from) => acc.split(from).join(NAME_ALIASES[from]),
          name
        );
        return { date, name: aliased };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    // 같은 날 공휴일이 겹치면(예: 어린이날·부처님오신날) 이름을 합친다
    const merged: { date: string; name: string }[] = [];
    list.forEach((h) => {
      const last = merged[merged.length - 1];
      if (last && last.date === h.date) {
        if (!last.name.split('·').includes(h.name)) last.name = `${last.name}·${h.name}`;
      } else merged.push({ ...h });
    });

    // 설날/추석 연속 구간 → 가운데만 당일 이름 유지
    const dayDiff = (a: string, b: string) =>
      Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
    for (let i = 0; i < merged.length; ) {
      const base = merged[i].name;
      if (base !== '설날' && base !== '추석') {
        i++;
        continue;
      }
      let j = i;
      while (
        j + 1 < merged.length &&
        merged[j + 1].name === base &&
        dayDiff(merged[j].date, merged[j + 1].date) === 1
      )
        j++;
      const mid = i + Math.floor((j - i) / 2);
      for (let k = i; k <= j; k++) if (k !== mid) merged[k].name = `${base} 연휴`;
      i = j + 1;
    }

    return merged;
  }

  // 받은 한 해 목록 중 [from, to] 기간만 교체. API 결과가 비어 있으면 기존 데이터 유지
  private async replaceRange(year: number, from: string, to: string): Promise<void> {
    const all = await this.fetchYear(year);
    if (all.length === 0) {
      console.warn(`holiday API returned no data for ${year}; keeping stored data`);
      return;
    }
    const inRange = all.filter((h) => h.date >= from && h.date <= to);
    await this.holidayRepository.replaceHolidays(from, to, inRange);
  }

  // 매월 첫 요청 시 1회 동기화 (작년/올해/내년만 보관)
  //  - 올해: 이번 달 ~ 12월만 교체 (지난 달은 저장값 유지)
  //  - 내년: 1월·6월에 전체 교체
  //  - 저장된 데이터가 하나도 없는 해: 전체 받아옴 (최초 설치 / 해가 바뀐 직후)
  private async syncIfNeeded(): Promise<void> {
    const { year, month } = kstToday();
    const thisMonth = `${year}-${pad2(month)}`;
    const years = [year - 1, year, year + 1];

    const settings = await this.agentinfoRepository.getAppSettings();
    const row = settings.find((r) => r.setting_key === SYNC_SETTING_KEY);
    let lastSyncMonth = '';
    try {
      lastSyncMonth = row ? JSON.parse(row.setting_value)?.lastSyncMonth ?? '' : '';
    } catch {
      lastSyncMonth = '';
    }

    const counts = await this.holidayRepository.countByYear(years);
    const monthlyDue = lastSyncMonth !== thisMonth;
    const emptyYears = years.filter((y) => counts[y] === 0);
    if (!monthlyDue && emptyYears.length === 0) return;
    if (Date.now() - lastFailedAt < RETRY_COOLDOWN_MS) return;

    try {
      for (const y of emptyYears) {
        console.log(`holiday sync: full year ${y} (no stored data)`);
        await this.replaceRange(y, `${y}-01-01`, `${y}-12-31`);
      }
      if (monthlyDue) {
        if (!emptyYears.includes(year)) {
          console.log(`holiday sync: ${year} from ${thisMonth}`);
          await this.replaceRange(year, `${thisMonth}-01`, `${year}-12-31`);
        }
        if ((month === 1 || month === 6) && !emptyYears.includes(year + 1)) {
          console.log(`holiday sync: next year ${year + 1}`);
          await this.replaceRange(year + 1, `${year + 1}-01-01`, `${year + 1}-12-31`);
        }
      }
      await this.holidayRepository.pruneOutsideYears(year - 1, year + 1);
      if (monthlyDue)
        await this.agentinfoRepository.upsertAppSetting(
          SYNC_SETTING_KEY,
          JSON.stringify({ lastSyncMonth: thisMonth })
        );
    } catch (err) {
      lastFailedAt = Date.now();
      throw err;
    }
  }

  // 작년~내년 공휴일 { 'YYYY-MM-DD': 이름 }. 동기화가 실패해도 저장된 데이터는 반환
  async getHolidays(): Promise<{ holidays: { [date: string]: string } }> {
    if (!syncInFlight) {
      syncInFlight = this.syncIfNeeded()
        .catch((err) => console.error('holiday sync failed', err))
        .finally(() => {
          syncInFlight = null;
        });
    }
    await syncInFlight;

    const { year } = kstToday();
    const rows = await this.holidayRepository.getHolidays(`${year - 1}-01-01`, `${year + 1}-12-31`);
    const holidays: { [date: string]: string } = {};
    rows.forEach((r) => (holidays[r.holiday_date] = r.name));
    return { holidays };
  }
}

export default Holiday;
