import { useEffect, useMemo, useState } from "react";
import { useAgent } from "./hooks/useAgentinfo";
import "./App.css";
import "./styles.css";

import MyCalendar from "./MyCalendar";
import { EventInput, EventDropArg, EventClickArg, EventContentArg } from "@fullcalendar/core";
import { DateClickArg } from "@fullcalendar/interaction";
import { DateObject } from "react-multi-date-picker"; // DateObject를 임포트
import Table from "./ReactTable";
import { KOREAN_HOLIDAYS } from "./koreanHolidays";

export interface Agentinfo {
  name: string;
  job_level: string;
}

// 달력 이벤트 색상: 기본은 전원 흰색, 클릭으로 선택된 인원만 강조색
const DEFAULT_EVENT_COLOR = "#ffffff";
const DEFAULT_EVENT_BORDER = "#c9c9c9";
const SELECTED_EVENT_COLOR = "#1a73e8";

function App() {
  const {
    agentList,
    selectedDates,
    scheduleEssentialWork,
    directorFullQuota,
    scheduleDate,
    selectedSubjob1,
    selectedSubjob2,
    leaveList,
    annualLeaveList,
    mandatoryWorkList,
    holiday,
    alternativeholiday,
    currentMonth,
    monthlySchedule,
    confirmSchedule,
    resetMonthlyScheduleTable,
  } = useAgent();

  const [agentData, setAgentData] = useState<Agentinfo[]>([]);
  // 확정 저장을 위해 마지막으로 생성된 휴무(가공 전 원본)와 그 대상 달을 보관
  //  type: "leave" 일반 휴무 / "comp" 공휴일 근무 대체휴무 / "annual" 연차
  const [generatedLeaves, setGeneratedLeaves] = useState<
    { name: string; date: string; type: "leave" | "comp" | "annual" }[]
  >([]);
  const [generatedMonth, setGeneratedMonth] = useState<string>("");
  const [isConfirming, setIsConfirming] = useState(false);
  // 달력 수동 편집(미리보기 전용): 삭제 아이콘이 떠 있는 이벤트("이름|날짜") / 추가 위젯이 열려있는 날짜
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [addDate, setAddDate] = useState<string | null>(null);
  const [addSelection, setAddSelection] = useState<string>("");
  // 달력에서 클릭으로 선택한 인원 — 선택되면 그 인원의 휴무 이벤트만 강조색으로 표시
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);

  useEffect(() => {
    if (agentList) {
      setAgentData(agentList);
    }
  }, [agentList]);

  useEffect(() => {
    if (currentMonth) {
      console.log("currentMonth ", currentMonth);
    }
  }, [currentMonth]);

  // 한 번 생성한 결과(스케줄 상태 묶음)
  type AttemptState = {
    employeeleaveSchedule: { [key: string]: string[] };
    leaveCounter: { [key: string]: number };
    lastLeaveDay: { [key: string]: number };
    offDutyEmployees: { [key: string]: string[] };
    allLeaves: { name: string; date: string; day: number }[];
  };

  const generateLeaveSchedule = () => {
    if (!agentData || agentData.length === 0 || !scheduleEssentialWork || scheduleEssentialWork.length < 5) return;

    const DEBUG = false;
    const log = (...args: unknown[]) => { if (DEBUG) console.log(...args); };

    //#################### 0. 대상 연/월 및 일수 (currentMonth 기준으로 동기 계산)
    const now = new Date();
    const ym = currentMonth && /^\d{4}-\d{2}$/.test(currentMonth)
      ? currentMonth
      : `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}`;
    const [targetYear, targetMonth] = ym.split("-").map(Number); // targetMonth: 1~12
    const daysInMonth = new Date(targetYear, targetMonth, 0).getDate(); // 해당 월의 마지막 날
    const pad2 = (n: number) => n.toString().padStart(2, "0");
    const dateOf = (day: number) => `${targetYear}-${pad2(targetMonth)}-${pad2(day)}`;

    //#################### 0-1. 필수 근무 조건
    const maxLeavesPerEmployee = scheduleEssentialWork[0]; // 직원당 의무 휴무 일수 (연차 제외)
    const weekdayWorkers = scheduleEssentialWork[1];       // 평일 목표 근무 인원
    const weekendWorkers = weekdayWorkers + 1;             // 주말은 평일 +1
    const minSeniors = scheduleEssentialWork[2];           // 하루 최소 책임급(점장·매니저·부점장) 인원
    const minFirstFloor = scheduleEssentialWork[3];        // 하루 최소 1층 근무 인원
    const minSecondFloor = scheduleEssentialWork[4];       // 하루 최소 2층 근무 인원
    const minWorkGap = 3; // 목표: 연속 근무 3일 이하 후 휴무
    const maxWorkGap = 5; // 절대 한계: 연속 근무는 maxWorkGap-1(=4)일까지. 4일 도달 시 다음 날 강제 휴무

    // 요일 판별 → 평일/주말 목표 근무·휴무 인원
    const dowOf = (day: number) => new Date(targetYear, targetMonth - 1, day).getDay(); // 0=일 … 6=토
    const isWeekendDay = (day: number) => dowOf(day) === 0 || dowOf(day) === 6;
    const workTargetOf = (day: number) => (isWeekendDay(day) ? weekendWorkers : weekdayWorkers);
    const leaveTargetOf = (day: number) => Math.max(0, agentData.length - workTargetOf(day));
    const maxDailyLeave = Math.max(1, agentData.length - weekdayWorkers); // fillSparseDays 레벨 상한

    //#################### 0-2. 전체 휴무 / 대체 휴무 (대상 월의 '일' 숫자만)
    //  - offday      : 매장 전체 휴무 (근무/휴무 개념 없음, 의무 휴무 카운트 미포함)
    //  - alteroffday : 대체 휴무 1일 크레딧 (평일이면 근무 여부 무관 전원, 주말이면 그 날 근무자만)
    const offday: number[] = [];
    const alteroffday: number[] = [];
    holiday.forEach((d: DateObject) => {
      const jd = d.toDate();
      if (jd.getFullYear() === targetYear && jd.getMonth() + 1 === targetMonth) offday.push(jd.getDate());
    });
    alternativeholiday.forEach((d: DateObject) => {
      const jd = d.toDate();
      if (jd.getFullYear() === targetYear && jd.getMonth() + 1 === targetMonth) alteroffday.push(jd.getDate());
    });
    // 한국 공휴일 자동 반영: 설날·추석 '당일' → 전체 휴무 / 그 외 공휴일 → 근무 + 대체휴무 크레딧
    for (let day = 1; day <= daysInMonth; day++) {
      const holidayName = KOREAN_HOLIDAYS[dateOf(day)];
      if (!holidayName) continue;
      if (holidayName === "설날" || holidayName === "추석") {
        if (!offday.includes(day)) offday.push(day);
      } else if (!alteroffday.includes(day)) {
        alteroffday.push(day);
      }
    }
    // 대체 휴무 크레딧 계산: 평일(월~금) 공휴일은 그 날 근무 여부와 무관하게 전 인원이 크레딧을 받고
    // (이미 그 날 개인 휴무·연차였던 사람도 포함), 주말 공휴일은 기존처럼 그 날 실제 근무한 사람만 받는다.
    const holidayCreditFor = (empName: string, schedule: { [key: string]: string[] }): number =>
      alteroffday.reduce((sum, d) => {
        if (!isWeekendDay(d)) return sum + 1;
        return sum + (schedule[empName].includes(dateOf(d)) ? 0 : 1);
      }, 0);

    //#################### 0-3. 직급 판별 헬퍼
    const isDirector = (e: Agentinfo) => e.job_level === "점장";
    // 점장을 알고리즘의 휴무 배정(의무 휴무 쿼터·강제휴무·대체휴무 등)에서 뺄지 여부.
    //  directorFullQuota = false(기본): 사전 확정 휴무일에만 쉼 / true: 다른 직원과 동일하게 배정 대상
    const directorExempt = (e: Agentinfo) => isDirector(e) && !directorFullQuota;
    const isTopAdmin = (e: Agentinfo) => e.job_level === "점장" || e.job_level === "2층 부점장"; // 점장·부점장
    const isPureManager = (e: Agentinfo) => e.job_level === "1층 매니저" || e.job_level === "2층 매니저";
    const isSenior = (e: Agentinfo) => isTopAdmin(e) || isPureManager(e); // 책임급 (점장·매니저·부점장)
    // 각 층 소속 인원 (점장은 층 고정이 아니라 '유동' — 부족한 층을 메움, floorCoverageOk 참고)
    const isFirstFloor = (e: Agentinfo) =>
      e.job_level === "1층 사원" || e.job_level === "1층 대리" || e.job_level === "1층 매니저";
    const isSecondFloor = (e: Agentinfo) =>
      e.job_level === "2층 사원" || e.job_level === "2층 대리" || e.job_level === "2층 매니저" || e.job_level === "2층 부점장";
    // 각 층 '대리급 이상' (점장 제외한 순수 층 리드)
    const isFirstFloorLeadPure = (e: Agentinfo) =>
      e.job_level === "1층 매니저" || e.job_level === "1층 대리";
    const isSecondFloorLeadPure = (e: Agentinfo) =>
      e.job_level === "2층 부점장" || e.job_level === "2층 매니저" || e.job_level === "2층 대리";

    // 층별 커버리지(최소 인원 + 대리급 이상 1명)를 점장 유동 배치까지 고려해 만족하는지.
    //  점장은 하루에 한 층만 채울 수 있으므로 '두 층이 동시에 부족'하면 불가.
    const floorCoverageOk = (working: Agentinfo[]): boolean => {
      const flex = working.filter(isDirector).length; // 유동 인원 (보통 점장 0~1명)
      const ff = working.filter(isFirstFloor).length;
      const sf = working.filter(isSecondFloor).length;
      const ffL = working.filter(isFirstFloorLeadPure).length;
      const sfL = working.filter(isSecondFloorLeadPure).length;
      const floorOk = (bodies: number, leads: number, min: number) => bodies >= min && leads >= 1;

      if (floorOk(ff, ffL, minFirstFloor) && floorOk(sf, sfL, minSecondFloor)) return true;
      if (flex < 1) return false;
      // 점장을 1층 또는 2층 한쪽에 투입 (인원 +1, 리드 +1)
      const putFirst = floorOk(ff + 1, ffL + 1, minFirstFloor) && floorOk(sf, sfL, minSecondFloor);
      const putSecond = floorOk(ff, ffL, minFirstFloor) && floorOk(sf + 1, sfL + 1, minSecondFloor);
      return putFirst || putSecond;
    };

    //#################### 0-4. 필수 근무일 (해당 인원은 이 날 절대 휴무 배정 금지)
    //  mandatoryWorkList : { title: 이름, start: 'YYYY-MM-DD' }[] — 대상 월만 반영
    const mandatoryWorkSet: { [name: string]: Set<string> } = {};
    mandatoryWorkList.forEach(({ title, start }: EventInput) => {
      if (!title || !start) return;
      const date = start.toString();
      if (date.includes("NaN")) return;
      const [y, m] = date.split("-").map(Number);
      if (y !== targetYear || m !== targetMonth) return;
      if (!mandatoryWorkSet[title]) mandatoryWorkSet[title] = new Set<string>();
      mandatoryWorkSet[title].add(date);
    });
    const isMandatoryWork = (name: string, date: string) =>
      !!mandatoryWorkSet[name] && mandatoryWorkSet[name].has(date);

    //#################### 1. 사전 확정 휴무 (결정적: 모든 시도에서 동일)
    //  - leaveList        : 직원 신청 휴무   → 의무 휴무 카운트에 포함
    //  - annualLeaveList  : 연차             → 의무 휴무 카운트에서 제외
    const baseLeaveSchedule: { [key: string]: string[] } = {};
    const baseLeaveCounter: { [key: string]: number } = {};
    const basePreLeaves: { name: string; date: string; day: number }[] = [];

    agentData.forEach((emp) => {
      baseLeaveSchedule[emp.name] = [];
      baseLeaveCounter[emp.name] = 0;
    });

    const applyPreset = (list: EventInput[], countsTowardQuota: boolean) => {
      list.forEach(({ title, start }: EventInput) => {
        if (!title || !start || !baseLeaveSchedule[title]) return;
        const date = start.toString();
        if (date.includes("NaN")) return;
        const [y, m, d] = date.split("-").map(Number);
        if (y !== targetYear || m !== targetMonth) return; // 대상 월만 반영
        if (isMandatoryWork(title, date)) return; // 필수 근무일은 휴무 신청보다 우선
        if (baseLeaveSchedule[title].includes(date)) return;
        baseLeaveSchedule[title].push(date);
        if (countsTowardQuota) baseLeaveCounter[title] += 1;
        basePreLeaves.push({ name: title, date, day: d });
      });
    };
    applyPreset(leaveList, true);
    applyPreset(annualLeaveList, false);

    //#################### 2. 한 번의 스케줄 생성 시도 (랜덤 기반)
    const randomBuffer = new Uint32Array(1);
    const randInt = (n: number) => {
      window.crypto.getRandomValues(randomBuffer);
      return randomBuffer[0] % n;
    };

    const runAttempt = (): AttemptState => {
      const employeeleaveSchedule: { [key: string]: string[] } = {};
      const leaveCounter: { [key: string]: number } = {};
      const lastLeaveDay: { [key: string]: number } = {};
      const offDutyEmployees: { [key: string]: string[] } = {};
      const allLeaves = basePreLeaves.map((l) => ({ ...l }));

      agentData.forEach((emp) => {
        employeeleaveSchedule[emp.name] = [...baseLeaveSchedule[emp.name]];
        leaveCounter[emp.name] = baseLeaveCounter[emp.name];
        lastLeaveDay[emp.name] = -minWorkGap;
      });

      // member 를 그 날 쉬게 했을 때 남는 근무 인원이 매장 운영 조건을 만족하는지 검사.
      //  유일한 절대 조건 = 인원별 의무 휴일. 그 외는 최대한만 맞춘다.
      //  strict = true  : 일반 조건 (층·책임급·리드 최소 + 점장·부점장 1명 + subjob 겹침 방지 + 목표 근무 인원)
      //  strict = false : 예외(채우기·막판·강제휴무) - "최소 근무 인원(목표 - 1, 주말은 +1 이 목표에 반영됨)" 만 확인
      const checkConditionToLeave = (
        date: string,
        dailyWorkforce: Agentinfo[],
        member: Agentinfo,
        strict: boolean
      ): boolean => {
        const day = parseInt(date.split("-")[2]);
        const temp = dailyWorkforce.filter((emp) => !offDutyEmployees[date].includes(emp.name));
        const minHeadcount = workTargetOf(day) - 1; // 완화 시 최소 근무 인원 (평일 목표-1 / 주말 목표-1)

        // ── 4일 연속 근무 초과자 강제 휴무 / 완화 단계: 최소 근무 인원만 ──
        const forcedRest =
          lastLeaveDay[member.name] > 0 && day - lastLeaveDay[member.name] >= maxWorkGap;
        if (forcedRest || !strict) return temp.length >= minHeadcount;

        // ── 일반(strict) 조건 ──
        const topAdmin = temp.filter(isTopAdmin).length;       // 점장·부점장
        const seniors = temp.filter(isSenior).length;          // 책임급 (매니저 포함)
        const subjob1Left = temp.filter((emp) => selectedSubjob1.includes(emp.name)).length;
        const subjob2Left = temp.filter((emp) => selectedSubjob2.includes(emp.name)).length;

        if (!floorCoverageOk(temp)) return false;              // 층별 최소 인원·리드 (점장 유동 배치 반영)
        if (seniors < minSeniors) return false;                // 책임급 최소
        if (topAdmin < 1) return false;                        // 점장 또는 부점장 최소 1명
        if (selectedSubjob1.includes(member.name) && subjob1Left < 1) return false; // 동일 subjob 겹침 방지
        if (selectedSubjob2.includes(member.name) && subjob2Left < 1) return false;
        if (temp.length < workTargetOf(day)) return false;     // 목표 근무 인원 (평일/주말)

        return true;
      };

      //#################### 근무 간격 / 분산 헬퍼 (employeeleaveSchedule 를 진실의 원천으로 사용)
      const targetWorkGap = minWorkGap + 1; // 목표 cadence: minWorkGap 일 근무 후 휴무

      const leaveDayNums = (name: string): number[] =>
        employeeleaveSchedule[name]
          .map((ds) => parseInt(ds.split("-")[2], 10))
          .filter((n) => !Number.isNaN(n));

      // day 와 가장 가까운 기존 휴무일 사이의 간격 (없으면 큰 값)
      const nearestLeaveGap = (name: string, day: number): number => {
        let best = 999;
        for (const d of leaveDayNums(name)) best = Math.min(best, Math.abs(d - day));
        return best;
      };
      // day 이전(과거) 가장 최근 휴무로부터의 경과 일수.
      //  이전 달 근무 이력을 알 수 없어 월초엔 -minWorkGap 기준(=자유롭게 배정 가능)
      const daysSinceLeave = (name: string, day: number): number => {
        let last = -minWorkGap;
        for (const d of leaveDayNums(name)) if (d < day) last = Math.max(last, d);
        return day - last;
      };
      // 강제 휴무 판정용: 이번 달 실제 휴무 or 월초(=0) 기준으로 연속 근무일 계산
      const consecutiveWorkDays = (name: string, day: number): number => {
        let last = 0;
        for (const d of leaveDayNums(name)) if (d < day) last = Math.max(last, d);
        return day - last - 1;
      };
      // day 에 추가로 쉬게 해도 최소 근무 간격이 지켜지는가 (양방향)
      const spacingOk = (name: string, day: number): boolean =>
        nearestLeaveGap(name, day) >= minWorkGap;

      //#################### 2-1. 날짜별로 휴무 배정 (오래 못 쉰 사람 우선 + 근무 간격 준수)
      for (let day = 1; day <= daysInMonth; day++) {
        if (offday.includes(day)) continue; // 전체 휴무일은 근무/휴무 개념 없음
        const date = dateOf(day);
        offDutyEmployees[date] = [];

        // 사전 확정 휴무 반영
        agentData.forEach((emp) => {
          if (employeeleaveSchedule[emp.name].includes(date)) {
            lastLeaveDay[emp.name] = day;
            if (!offDutyEmployees[date].includes(emp.name)) offDutyEmployees[date].push(emp.name);
          }
        });

        // 사전휴무 인원을 제외한 전체 근무 가능 인원
        const dailyWorkforce = agentData.filter((emp) => !employeeleaveSchedule[emp.name].includes(date));

        // 기본 후보군: 점장 제외 + 의무휴무 미달 + 오늘 사전휴무 아님 + 최소 근무 간격 준수 + 필수 근무일 아님
        const baseCandidates = agentData.filter(
          (emp) =>
            !directorExempt(emp) &&
            leaveCounter[emp.name] < maxLeavesPerEmployee &&
            !employeeleaveSchedule[emp.name].includes(date) &&
            !isMandatoryWork(emp.name, date) &&
            spacingOk(emp.name, day)
        );
        const assigned = new Set<string>();

        const commitLeave = (emp: Agentinfo) => {
          leaveCounter[emp.name] += 1;
          lastLeaveDay[emp.name] = day;
          employeeleaveSchedule[emp.name].push(date);
          allLeaves.push({ name: emp.name, date, day });
          assigned.add(emp.name);
        };

        //#################### 2-2. 연속 근무 한계(maxWorkGap-1일) 도달자 강제 휴무
        //  의무휴무 소진 여부·목표 간격과 무관하게, 최소 근무 인원만 지켜지면 무조건 쉬게 한다.
        agentData
          .filter(
            (emp) =>
              !directorExempt(emp) &&
              !employeeleaveSchedule[emp.name].includes(date) &&
              !isMandatoryWork(emp.name, date) &&
              consecutiveWorkDays(emp.name, day) >= maxWorkGap - 1
          )
          .sort((a, b) => consecutiveWorkDays(b.name, day) - consecutiveWorkDays(a.name, day))
          .forEach((emp) => {
            if (assigned.has(emp.name)) return;
            offDutyEmployees[date].push(emp.name);
            if (!checkConditionToLeave(date, dailyWorkforce, emp, false)) offDutyEmployees[date].pop();
            else commitLeave(emp);
          });

        //#################### 2-3. 목표 휴무 인원까지 배정 — 오래 못 쉰 사람부터
        //  1순위: 목표 간격(targetWorkGap) 지난 사람 / 2순위: 최소 간격만 지난 사람
        const fillToTarget = (minGap: number) => {
          while (offDutyEmployees[date].length < leaveTargetOf(day)) {
            const pool = baseCandidates
              .filter((emp) => !assigned.has(emp.name) && daysSinceLeave(emp.name, day) >= minGap)
              .sort((a, b) => daysSinceLeave(b.name, day) - daysSinceLeave(a.name, day));
            if (pool.length === 0) break;
            // 간격이 비슷한 상위권(±1) 중 랜덤으로 1명
            const topGap = daysSinceLeave(pool[0].name, day);
            const top = pool.filter((e) => daysSinceLeave(e.name, day) >= topGap - 1);
            const picked = top[randInt(top.length)];

            offDutyEmployees[date].push(picked.name);
            if (!checkConditionToLeave(date, dailyWorkforce, picked, true)) {
              offDutyEmployees[date].pop();
              assigned.add(picked.name); // 이 날은 불가 → 후보에서 제외
              continue;
            }
            commitLeave(picked);
          }
        };
        fillToTarget(targetWorkGap);
        fillToTarget(minWorkGap);
      }

      //#################### 3. 휴무 인원이 적은 날부터 채우기 (근무 간격 준수 · 휴무 적은 사람 우선)
      const fillSparseDays = () => {
        for (let level = 0; level < maxDailyLeave; level++) {
          for (const date in offDutyEmployees) {
            const day = parseInt(date.split("-")[2]);
            if (offday.includes(day)) continue;
            if (offDutyEmployees[date].length !== level) continue;

            const dailyWorkforce = agentData.filter((emp) => !employeeleaveSchedule[emp.name].includes(date));
            const tried = new Set<string>();

            while (offDutyEmployees[date].length < leaveTargetOf(day)) {
              const pool = agentData
                .filter(
                  (emp) =>
                    !directorExempt(emp) &&
                    !tried.has(emp.name) &&
                    !offDutyEmployees[date].includes(emp.name) &&
                    !isMandatoryWork(emp.name, date) &&
                    leaveCounter[emp.name] < maxLeavesPerEmployee &&
                    spacingOk(emp.name, day)
                )
                // 휴무가 적은 사람 → 기존 휴무와 멀리 떨어진 날 우선
                .sort(
                  (a, b) =>
                    leaveCounter[a.name] - leaveCounter[b.name] ||
                    nearestLeaveGap(b.name, day) - nearestLeaveGap(a.name, day)
                );
              if (pool.length === 0) break;
              const picked = pool[randInt(Math.min(3, pool.length))];
              tried.add(picked.name);

              offDutyEmployees[date].push(picked.name);
              if (!checkConditionToLeave(date, dailyWorkforce, picked, false)) {
                offDutyEmployees[date].pop();
                continue;
              }
              leaveCounter[picked.name] += 1;
              lastLeaveDay[picked.name] = day;
              employeeleaveSchedule[picked.name].push(date);
              allLeaves.push({ name: picked.name, date, day });
            }
          }
        }
      };
      fillSparseDays();

      //#################### 4. 대체 휴무: 평일 공휴일(alteroffday)은 근무 여부 무관 전원, 주말 공휴일은 근무한 인원만큼 의무 휴무가 늘어난다
      const holidayCredit: { [key: string]: number } = {};
      agentData.forEach((emp) => {
        holidayCredit[emp.name] = directorExempt(emp) ? 0 : holidayCreditFor(emp.name, employeeleaveSchedule);
      });
      const quotaOf = (name: string) => maxLeavesPerEmployee + (holidayCredit[name] || 0);

      //#################### 5. 의무 휴무(+대체 휴무) 미달 인원 배치 (점장 제외)
      //  기존 휴무와 가장 멀고 그 날 휴무자가 적은 날부터. 1차는 최소 간격 준수, 못 채우면 간격 완화(≥2).
      agentData.forEach((employee) => {
        if (directorExempt(employee)) return;
        const failed = new Set<number>();
        let guard = 0;
        for (const minGap of [minWorkGap, 2]) {
          while (leaveCounter[employee.name] < quotaOf(employee.name) && guard++ < 400) {
            const dayCandidates: { day: number; date: string; gap: number; occ: number }[] = [];
            for (let day = 1; day <= daysInMonth; day++) {
              if (offday.includes(day) || alteroffday.includes(day) || failed.has(day)) continue;
              const date = dateOf(day);
              if (employeeleaveSchedule[employee.name].includes(date)) continue;
              if (isMandatoryWork(employee.name, date)) continue;
              if (nearestLeaveGap(employee.name, day) < minGap) continue;
              dayCandidates.push({
                day,
                date,
                gap: nearestLeaveGap(employee.name, day),
                occ: offDutyEmployees[date]?.length ?? 0,
              });
            }
            if (dayCandidates.length === 0) break;
            // 기존 휴무와 멀리 떨어지고(gap 큼) 그 날 휴무자가 적은(occ 작음) 날 우선
            dayCandidates.sort((a, b) => b.gap - a.gap || a.occ - b.occ);
            const choice = dayCandidates[randInt(Math.min(3, dayCandidates.length))];

            employeeleaveSchedule[employee.name].push(choice.date);
            const dailyWorkforce = agentData.filter((emp) => !employeeleaveSchedule[emp.name].includes(choice.date));
            if (checkConditionToLeave(choice.date, dailyWorkforce, employee, false)) {
              leaveCounter[employee.name] += 1;
              lastLeaveDay[employee.name] = choice.day;
              allLeaves.push({ name: employee.name, date: choice.date, day: choice.day });
              if (!offDutyEmployees[choice.date]) offDutyEmployees[choice.date] = [];
              offDutyEmployees[choice.date].push(employee.name);
            } else {
              employeeleaveSchedule[employee.name].pop();
              failed.add(choice.day);
            }
          }
        }
      });

      //#################### 5-1. 연속 근무 5일 이상 구간 잘라내기 (최대 4일 연속 근무 규칙)
      //  각 인원의 휴무 사이(그리고 월초~첫휴무, 마지막휴무~월말) 간격이 maxWorkGap 이상이면
      //  그 구간 안에 하루 휴무를 끼워 넣는다. 최소 근무 인원만 지켜지면 배치.
      agentData.forEach((emp) => {
        if (directorExempt(emp)) return;
        let guard = 0;
        let progressed = true;
        while (progressed && guard++ < 80) {
          progressed = false;
          const marks = [0, ...leaveDayNums(emp.name).sort((a, b) => a - b), daysInMonth + 1];
          for (let k = 0; k < marks.length - 1; k++) {
            const from = marks[k];
            const to = marks[k + 1];
            if (to - from - 1 < maxWorkGap) continue; // 연속 근무 4일 이하 → OK

            // 구간 중앙에서 바깥쪽으로 탐색하며 배치 가능한 근무일을 찾는다
            const mid = Math.round((from + to) / 2);
            let placed = false;
            for (let step = 0; step <= to - from && !placed; step++) {
              for (const cand of step === 0 ? [mid] : [mid - step, mid + step]) {
                if (cand <= from || cand >= to) continue;
                if (offday.includes(cand)) continue;
                const date = dateOf(cand);
                if (isMandatoryWork(emp.name, date)) continue;
                if (employeeleaveSchedule[emp.name].includes(date)) continue;
                employeeleaveSchedule[emp.name].push(date);
                const dw = agentData.filter((e) => !employeeleaveSchedule[e.name].includes(date));
                if (checkConditionToLeave(date, dw, emp, false)) {
                  leaveCounter[emp.name] += 1;
                  lastLeaveDay[emp.name] = cand;
                  allLeaves.push({ name: emp.name, date, day: cand });
                  if (!offDutyEmployees[date]) offDutyEmployees[date] = [];
                  offDutyEmployees[date].push(emp.name);
                  placed = true;
                  progressed = true;
                } else {
                  employeeleaveSchedule[emp.name].pop();
                }
              }
            }
          }
        }
      });

      return { employeeleaveSchedule, leaveCounter, lastLeaveDay, offDutyEmployees, allLeaves };
    };

    //#################### 6. 여러 번 생성 후 품질 점수가 가장 좋은(=낮은) 결과 채택
    //  랜덤은 유지하되(매번 다른 결과), best-of-N 으로 품질을 끌어올린다.
    const scoreAttempt = (st: AttemptState): number => {
      let penalty = 0;

      // (1) 의무 휴무(+공휴일 대체휴무) 쿼터 미달/초과 (점장 제외)
      agentData.forEach((emp) => {
        if (directorExempt(emp)) return;
        const credit = holidayCreditFor(emp.name, st.employeeleaveSchedule);
        const diff = st.leaveCounter[emp.name] - (maxLeavesPerEmployee + credit);
        if (diff < 0) penalty += -diff * 1000; // 미달(대체휴무 미부여 포함): 매우 나쁨
        else if (diff > 0) penalty += diff * 400; // 초과
      });

      // (2) 일자별 근무 인원 / 매장 조건 + 휴무 분포 + subjob 겹침
      const offCounts: number[] = [];
      for (let day = 1; day <= daysInMonth; day++) {
        if (offday.includes(day)) continue;
        const date = dateOf(day);
        const offNames = st.offDutyEmployees[date] || [];
        const working = agentData.filter(
          (e) => !offNames.includes(e.name) && !st.employeeleaveSchedule[e.name].includes(date)
        );
        offCounts.push(agentData.length - working.length);

        const target = workTargetOf(day);
        if (working.length < target) penalty += (target - working.length) * 120;             // 목표 근무 인원 (soft)
        if (working.length < target - 1) penalty += (target - 1 - working.length) * 600;     // 최소 근무 인원 (목표-1) 미달 (hard)
        const seniors = working.filter(isSenior).length;
        if (seniors < minSeniors) penalty += (minSeniors - seniors) * 500;
        if (working.filter(isTopAdmin).length < 1) penalty += 400;                     // 점장·부점장 부재
        if (!floorCoverageOk(working)) penalty += 500;                                 // 층별 최소 인원·리드 (점장 유동 반영)

        // 동일 subjob 조 인원이 같은 날 모두 휴무면 벌점
        const sub1Named: string[] = (selectedSubjob1 as string[]).filter((n) => !!n);
        const sub2Named: string[] = (selectedSubjob2 as string[]).filter((n) => !!n);
        if (sub1Named.length > 0 && !working.some((w) => sub1Named.includes(w.name))) penalty += 150;
        if (sub2Named.length > 0 && !working.some((w) => sub2Named.includes(w.name))) penalty += 150;
      }

      // (3) 하루 휴무 인원 균등 분포 (분산이 작을수록 좋음)
      if (offCounts.length > 1) {
        const mean = offCounts.reduce((a, b) => a + b, 0) / offCounts.length;
        const variance = offCounts.reduce((a, b) => a + (b - mean) ** 2, 0) / offCounts.length;
        penalty += variance * 45;
      }

      // (4) 인원별 연속 근무일: 목표 3일 이하, 예외 4일, 5일 이상은 심각
      const maxStreakAllowed = maxWorkGap - 1; // 4일
      agentData.forEach((emp) => {
        if (directorExempt(emp)) return;
        const leaveDays = st.employeeleaveSchedule[emp.name]
          .map((d) => parseInt(d.split("-")[2]))
          .filter((d) => !Number.isNaN(d))
          .sort((a, b) => a - b);
        let prev = 0;
        [...leaveDays, daysInMonth + 1].forEach((d, i) => {
          const streak = d - prev - 1; // 이 구간의 연속 근무일수 (월초~첫휴무, 마지막휴무~월말 포함)
          const isInner = prev > 0 && i < leaveDays.length;
          if (streak > maxStreakAllowed) {
            penalty += (streak - maxStreakAllowed) * 300; // 5일 이상 연속근무: 매우 나쁨 (구간 위치 무관)
          } else if (streak === maxStreakAllowed) {
            penalty += 25; // 4일 연속: 예외적 허용, 소폭 억제
          } else if (isInner && streak < minWorkGap) {
            penalty += (minWorkGap - streak) * 40; // 휴무 몰림
          }
          prev = d;
        });
        // 휴무일 간격의 불균일함(분산)도 벌점
        if (leaveDays.length >= 2) {
          const gaps = leaveDays.slice(1).map((d, i) => d - leaveDays[i]);
          const gmean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
          const gvar = gaps.reduce((a, b) => a + (b - gmean) ** 2, 0) / gaps.length;
          penalty += gvar * 12;
        }
      });

      return penalty;
    };

    const ATTEMPTS = 60;
    let best: AttemptState | null = null;
    let bestScore = Infinity;
    for (let i = 0; i < ATTEMPTS; i++) {
      const st = runAttempt();
      const s = scoreAttempt(st);
      if (s < bestScore) {
        bestScore = s;
        best = st;
      }
    }
    if (!best) return;
    log("best score", bestScore, "/ attempts", ATTEMPTS);

    //#################### 7. 날짜순 정렬 후 인원별 휴무 유형 분류 (일반 / 대체 / 연차)
    const { allLeaves } = best;
    allLeaves.sort((a, b) => a.day - b.day);

    // 대상 월 연차 신청일 (name|date)
    const annualKeySet = new Set<string>();
    annualLeaveList.forEach(({ title, start }: EventInput) => {
      if (!title || !start) return;
      const d = start.toString();
      const [y, m] = d.split("-").map(Number);
      if (y === targetYear && m === targetMonth) annualKeySet.add(`${title}|${d}`);
    });

    // 인원별로 날짜순 누계: 연차 제외, 의무 휴무일수(maxLeavesPerEmployee) 초과분은 '대체'
    const obligatoryCount: { [key: string]: number } = {};
    const tagged = allLeaves.map(({ name, date }) => {
      if (annualKeySet.has(`${name}|${date}`)) {
        return { name, date, type: "annual" as const };
      }
      obligatoryCount[name] = (obligatoryCount[name] || 0) + 1;
      const type = obligatoryCount[name] > maxLeavesPerEmployee ? ("comp" as const) : ("leave" as const);
      return { name, date, type };
    });
    log("Result tagged : ", tagged);

    // 결과는 화면에만 반영 (확정 전까지 서버 저장 안 됨)
    setGeneratedLeaves(tagged);
    setGeneratedMonth(ym);
  };

  const genSch = () => {
    if (
      monthlySchedule.length > 0 &&
      !window.confirm(
        `${currentMonth} 은(는) 이미 확정된 스케줄이 있습니다.\n새로 생성하시겠어요? (확정을 누르기 전까지는 저장되지 않습니다)`
      )
    ) {
      return;
    }
    generateLeaveSchedule();
  };

  // 달력에 표시할 이벤트: 이번 달을 방금 생성했으면 그 제안, 아니면 서버 저장본
  //  draggable=true (미리보기)이면 일반/대체 휴무는 드래그 이동 가능, 연차는 표에서만 수정
  const buildCalendarEvents = (
    items: { name: string; date: string; jobLevel?: string; type?: string }[],
    draggable = false
  ): EventInput[] => {
    // 괄호 안 숫자 = 그 달의 누적 휴무일 (일반 + 대체 포함, 연차는 제외)
    const perPerson: { [key: string]: number } = {};
    return [...items]
      .filter((i) => i.date)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((i) => {
        // 기본은 전원 흰색, 달력에서 클릭으로 선택된 인원만 강조색으로 표시
        const isSelected = !!selectedEmployee && i.name === selectedEmployee;
        const ltype = (i.type as "leave" | "comp" | "annual") || "leave";
        const common = {
          id: `${i.name}|${i.date}`,
          start: i.date,
          backgroundColor: isSelected ? SELECTED_EVENT_COLOR : DEFAULT_EVENT_COLOR,
          borderColor: isSelected ? SELECTED_EVENT_COLOR : DEFAULT_EVENT_BORDER,
          textColor: isSelected ? "#ffffff" : "#333333",
          extendedProps: { name: i.name, ltype },
        };
        // 연차: 누적 휴무에 포함하지 않고 숫자도 표기하지 않음, 드래그 불가
        if (ltype === "annual") {
          return { ...common, title: `${i.name} 연차`, editable: false };
        }
        perPerson[i.name] = (perPerson[i.name] || 0) + 1;
        const label = ltype === "comp" ? " 대체" : "";
        return {
          ...common,
          title: `${i.name} (${perPerson[i.name]}일)${label}`,
          editable: draggable,
        };
      });
  };

  // 미리보기(생성 후·확정 전) 상태인지 — 이때만 달력 드래그 이동을 허용
  const isPreview =
    !!generatedMonth && generatedMonth === currentMonth && generatedLeaves.length > 0;

  const calendarEvents = useMemo(() => {
    if (isPreview) {
      return buildCalendarEvents(generatedLeaves, true);
    }
    return buildCalendarEvents(monthlySchedule);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreview, generatedLeaves, monthlySchedule, agentData, selectedEmployee]);

  // 달력에서 휴무를 다른 날짜로 드래그 → 미리보기(generatedLeaves) 갱신.
  //  확정 전이므로 별도 경고 없이 반영. 이후 '확정'을 누르면 이 값 그대로 저장됨.
  const handleEventDrop = (info: EventDropArg) => {
    const name: string = info.event.extendedProps?.name;
    const oldDate = info.oldEvent.startStr; // "YYYY-MM-DD"
    const newDate = info.event.startStr;
    if (!name || !oldDate || !newDate || oldDate === newDate) return;

    // 보이는 달 밖으로 이동 / 같은 사람이 그 날 이미 휴무 → 되돌림
    const outOfMonth = !newDate.startsWith(`${currentMonth}-`);
    const clash = generatedLeaves.some((l) => l.name === name && l.date === newDate);
    if (outOfMonth || clash) {
      info.revert();
      return;
    }
    setGeneratedLeaves((prev) =>
      prev.map((l) => (l.name === name && l.date === oldDate ? { ...l, date: newDate } : l))
    );
  };

  // 달을 옮기거나 미리보기를 벗어나면 열려 있던 삭제 아이콘/추가 위젯을 닫는다
  useEffect(() => {
    setPendingDeleteId(null);
    setAddDate(null);
    setAddSelection("");
  }, [currentMonth, isPreview]);

  // 휴무 이벤트 클릭 → 그 인원을 선택(같은 인원 다시 클릭하면 선택 해제)해 달력에서 강조 표시.
  //  미리보기 상태면 추가로 삭제 아이콘 토글(같은 걸 다시 클릭하면 숨김). 연차는 삭제 대상 아님(표에서 관리)
  const handleEventClick = (info: EventClickArg) => {
    const name = info.event.extendedProps?.name as string | undefined;
    if (name) setSelectedEmployee((prev) => (prev === name ? null : name));

    if (!isPreview) return;
    const ltype = info.event.extendedProps?.ltype as string | undefined;
    if (ltype === "annual") return;
    setAddDate(null); // 다른 곳에서 열려있던 추가 위젯은 닫기
    const id = info.event.id;
    setPendingDeleteId((prev) => (prev === id ? null : id));
  };

  // 삭제 아이콘 클릭 → generatedLeaves 에서 제거
  const handleDeleteLeave = (name: string, date: string) => {
    setGeneratedLeaves((prev) => prev.filter((l) => !(l.name === name && l.date === date)));
    setPendingDeleteId(null);
  };

  // 이벤트 커스텀 렌더: 제목 + (삭제 아이콘이 열려있는 이벤트면) × 아이콘
  const renderEventContent = (arg: EventContentArg): React.ReactNode => {
    const id = arg.event.id;
    const ltype = arg.event.extendedProps?.ltype as string | undefined;
    const showX = isPreview && ltype !== "annual" && id === pendingDeleteId;
    return (
      <div className="kr-event-row">
        <span className="kr-event-title">{arg.event.title}</span>
        {showX && (
          <span
            className="kr-event-x"
            title="삭제"
            onClick={(e) => {
              e.stopPropagation();
              const [name, date] = id.split("|");
              handleDeleteLeave(name, date);
            }}
          >
            ×
          </span>
        )}
      </div>
    );
  };

  // 빈 날짜 클릭 → 그 날짜의 인원 추가 위젯 토글 (같은 날짜를 다시 클릭하면 닫힘)
  const handleDateClick = (info: DateClickArg) => {
    if (!isPreview) return;
    if (!info.dateStr.startsWith(`${currentMonth}-`)) return; // 보이는 달 밖 셀은 무시
    setPendingDeleteId(null); // 다른 곳에서 열려있던 삭제 아이콘은 닫기
    setAddDate((prev) => (prev === info.dateStr ? null : info.dateStr));
    setAddSelection("");
  };

  // 날짜 셀에 덧붙이는 "인원 추가" 위젯 (addDate 와 일치하는 날짜에만 표시)
  const renderDayExtra = (dateStr: string): React.ReactNode => {
    if (!isPreview || addDate !== dateStr) return null;
    const already = new Set(
      generatedLeaves.filter((l) => l.date === dateStr).map((l) => l.name)
    );
    const candidates = agentData.filter((a) => !already.has(a.name));
    return (
      <div
        className="kr-day-add"
        // FullCalendar 는 click 이 아니라 mousedown(/touchstart) 시점에 날짜 클릭 판정을 시작하므로
        // 거기서 전파를 막아야 위젯이 select 클릭에 의해 닫히지 않는다.
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <select value={addSelection} onChange={(e) => setAddSelection(e.target.value)}>
          <option value="">직원 선택</option>
          {candidates.map((a) => (
            <option key={a.name} value={a.name}>
              {a.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!addSelection}
          onClick={() => {
            if (!addSelection) return;
            setGeneratedLeaves((prev) => [...prev, { name: addSelection, date: dateStr, type: "leave" }]);
            setAddDate(null);
            setAddSelection("");
          }}
        >
          +
        </button>
      </div>
    );
  };

  // 스케줄 초기화: 확정 저장 기록(monthly_leaves) 삭제 + 모든 직원의 원하는 휴일/연차 신청 비움
  const resetScheduleTable = async () => {
    if (isConfirming) return;
    if (!window.confirm(
      "확정 저장된 모든 스케줄/연차 사용 기록이 삭제되고,\n직원들의 '원하는 휴일'과 '연차 신청' 입력도 모두 비워집니다.\n(이름/직무는 그대로 유지) 계속할까요?"
    )) return;
    try {
      setIsConfirming(true);
      const ok = await resetMonthlyScheduleTable();
      if (ok) alert("스케줄 테이블을 초기화했습니다.");
    } catch (err) {
      console.error("reset schedule table error", err);
      alert("테이블 초기화 중 오류가 발생했습니다.");
    } finally {
      setIsConfirming(false);
    }
  };

  // 생성된 스케줄을 확인하고 마음에 들면 서버에 확정 저장
  const confirmGeneratedSchedule = async () => {
    if (isConfirming) return;
    if (generatedLeaves.length === 0) {
      alert("먼저 Generate 로 스케줄을 생성하세요.");
      return;
    }
    if (!currentMonth || !/^\d{4}-\d{2}$/.test(currentMonth)) {
      alert("달력에서 확정할 달을 먼저 선택하세요.");
      return;
    }
    if (!agentList || agentList.length === 0) return;
    if (!window.confirm(`${currentMonth} 스케줄을 확정하고 저장할까요? (기존 확정본은 덮어씁니다)`)) return;

    const monthPrefix = `${currentMonth}-`;
    const entries = agentList.map((agent: any) => {
      const mine = generatedLeaves.filter(
        (l) => l.name === agent.name && l.date.startsWith(monthPrefix)
      );
      const datesOf = (t: "leave" | "comp") =>
        Array.from(new Set(mine.filter((l) => l.type === t).map((l) => l.date)));
      const leaveDates = datesOf("leave");
      const compLeaveDates = datesOf("comp");
      const annualLeaveDates = Array.from(
        new Set(
          annualLeaveList
            .filter(
              (e: EventInput) =>
                e.title === agent.name &&
                typeof e.start === "string" &&
                (e.start as string).startsWith(monthPrefix)
            )
            .map((e: EventInput) => e.start as string)
        )
      );
      return { agentId: agent.id, leaveDates, compLeaveDates, annualLeaveDates };
    });

    try {
      setIsConfirming(true);
      const ok = await confirmSchedule(currentMonth, entries);
      if (ok) {
        // 저장 후에는 서버 저장본을 표시하도록 생성 제안 상태를 비움
        setGeneratedLeaves([]);
        setGeneratedMonth("");
        alert(`${currentMonth} 스케줄을 확정 저장했습니다.`);
      }
    } catch (err) {
      console.error("confirm schedule error", err);
      alert("스케줄 확정 저장 중 오류가 발생했습니다.");
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="App">
      <MyCalendar
        events={calendarEvents}
        editable={isPreview}
        onEventDrop={handleEventDrop}
        onEventClick={handleEventClick}
        eventContent={renderEventContent}
        onDateClick={handleDateClick}
        renderDayExtra={renderDayExtra}
      />
      <div style={{ height: "10px" }}></div>
      <div style={{ display: 'flex', gap: '10px', marginLeft: '400px', marginTop: '10px' }}>
        <button onClick={genSch}> Generate </button>
        <button onClick={confirmGeneratedSchedule} disabled={isConfirming || generatedLeaves.length === 0}>
          {isConfirming ? '확정 중...' : '확정'}
        </button>
        <button onClick={resetScheduleTable} disabled={isConfirming} style={{ marginLeft: '20px', color: '#b6003b' }}>
          스케줄·휴일 입력 초기화
        </button>
      </div>
      <div style={{ height: "10px" }}></div>
      <Table />
    </div>
  );
}

export default App;
