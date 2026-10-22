// 한국 공휴일 헬퍼
//  공휴일 데이터는 서버(GET /apis/holiday)가 공공데이터포털 특일 정보 API 로 매월 갱신해 DB 에 보관하고,
//  클라이언트는 앱 시작 시 한 번 받아 useAgentinfo 의 holidays 상태로 쓴다.

// { 'YYYY-MM-DD': 공휴일 이름 }
export type HolidayMap = { [date: string]: string };

// Date -> 'YYYY-MM-DD' (로컬 기준, 타임존 밀림 없음)
export const ymd = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

export const getHolidayName = (holidays: HolidayMap, date: Date): string | undefined =>
  holidays[ymd(date)];

export const isWeekend = (date: Date): boolean => {
  const d = date.getDay();
  return d === 0 || d === 6;
};
