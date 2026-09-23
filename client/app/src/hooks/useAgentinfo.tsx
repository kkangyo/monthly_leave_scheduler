import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import agentAPI from "../apis/agent";
import { DateObject } from 'react-multi-date-picker'; // DateObject를 임포트
import { EventInput } from '@fullcalendar/core';

// Context 생성
const AgentContext = createContext<any>(null);

// 직급 순서: 점장 > 부점장 > 매니저 > 대리 > 사원 (표에서 위쪽부터 이 순서로 표기)
//  키워드 포함 여부로 판정 → 층 접두어("1층 "/"2층 ")나 옛 표기("매니저" 등), 유니코드 정규화 차이에도 견고
const jobRank = (raw: unknown): number => {
  const s = String(raw ?? "").normalize("NFC");
  if (s.includes("부점장")) return 1; // "점장" 보다 먼저 검사
  if (s.includes("점장")) return 0;
  if (s.includes("매니저")) return 2;
  if (s.includes("대리")) return 3;
  if (s.includes("사원")) return 4;
  return 98; // 미분류(빈 값/신규 행)는 맨 아래
};
const floorRank = (raw: unknown): number => {
  const s = String(raw ?? "").normalize("NFC");
  if (s.includes("1층")) return 0;
  if (s.includes("2층")) return 1;
  return 2;
};
const sortByJobRank = (list: any[] | undefined): any[] =>
  [...(list ?? [])].sort(
    (a, b) =>
      jobRank(a?.job_level) - jobRank(b?.job_level) ||
      floorRank(a?.job_level) - floorRank(b?.job_level)
  );

export const AgentProvider = ({ children }: { children: React.ReactNode }) => {
  const [rows, setRows] = useState<number>(0);
  const [agentList, setAgentList] = useState<any[] | undefined>(undefined);
  const [selectedDates, setSelectedDates] = useState<{ [key: number]: {name:string; date:DateObject[]} }>({});
  const [selectedAnnualleave, setSelectedAnnualleave] = useState<{ [key: number]: {name:string; date:DateObject[]} }>({});
  const [selectedMandatoryWork, setSelectedMandatoryWork] = useState<{ [key: number]: {name:string; date:DateObject[]} }>({});
  const [leaveList, setLeaveList] = useState<EventInput[]>([]);
  const [annualLeaveList, setAnnualLeaveList] = useState<EventInput[]>([]);
  const [mandatoryWorkList, setMandatoryWorkList] = useState<EventInput[]>([]);
  // [1인당 휴일, 평일 근무 인원(주말 +1), 최소 책임급 수, 필수 1층 인원, 필수 2층 인원]
  const [scheduleEssentialWork, setScheduleEssentialWork] = useState<number[]>([8,6,1,3,2]);
  // 점장 휴무 방식: false(기본) = 사전 확정 휴무일에만 쉼 / true = 다른 직원처럼 의무 휴무(1인당 휴일)까지 배정
  const [directorFullQuota, setDirectorFullQuota] = useState<boolean>(false);
  const [selectedSubjob1, setSelectedSubjob1] = useState<string[]>([]);
  const [selectedSubjob2, setSelectedSubjob2] = useState<string[]>([]);
  const [currentMonth, setCurrentMonth] = useState<string>(""); // 초기값 현재 달
  const [annualLeaveUsage, setAnnualLeaveUsage] = useState<{ [agentId: string]: number }>({}); // 인원별 누적 사용 연차
  // 현재 보고 있는 달의 확정 휴일/연차 (서버 저장본)
  const [monthlySchedule, setMonthlySchedule] = useState<
    { agentId: string; name: string; jobLevel: string; date: string; type: "leave" | "annual" | "comp" }[]
  >([]);
  const appSettingsLoadedRef = useRef(false); // 서버 설정 최초 로드 완료 여부

  const handleCreateAgent = async (
    name: string, joblevel: string, description: string, annualleave: string, mandatoryworkday: string
  ) => {
    const data = { name, joblevel, description, annualleave, mandatoryworkday };
    console.log('handleCreateAgent data',data);
    const result = await agentAPI.createAgentinfo(data);
    if (result.statusCode === 400) {
      alert(result.detail[0].constraints.isLength);
      return;
    }

    syncAgentList();
  };

  const handleUpdateAgent = async (id:string,
    name: string, joblevel: string, description: string, annualleave: string, mandatoryworkday: string
  ) => {
    const data = { name, joblevel, description, annualleave, mandatoryworkday };
    console.log('handleUpdateAgent data',data, 'id ',id);
    const result = await agentAPI.updateAgentinfo(id, data);
    if (result.statusCode === 400) {
      alert(result.detail[0].constraints.isLength);
      return;
    }

    syncAgentList();
  };

  const handleDeleteAgent = async (id:string,
    name: string, joblevel: string, description: string, annualleave: string, mandatoryworkday: string
  ) => {
    const data = { name, joblevel, description, annualleave, mandatoryworkday };
    console.log('deleteAgentinfo data',data, 'id ',id);

    const result = await agentAPI.deleteAgentinfo(id, data);
    if (result.statusCode === 400) {
      alert(result.detail[0].constraints.isLength);
      return;
    }

    syncAgentList();
  };

  // 표 전체 일괄 저장: 신규 추가/기존 수정/삭제 체크된 행을 한 번에 서버에 반영하고 마지막에 한 번만 목록을 새로고침
  const handleBulkSaveAgents = async (
    creates: { name: string; joblevel: string; description: string; annualleave: string; mandatoryworkday: string }[],
    updates: { id: string; name: string; joblevel: string; description: string; annualleave: string; mandatoryworkday: string }[],
    deletes: { id: string; name: string; joblevel: string; description: string; annualleave: string; mandatoryworkday: string }[]
  ) => {
    const errors: string[] = [];

    for (const c of creates) {
      const { name, joblevel, description, annualleave, mandatoryworkday } = c;
      const result = await agentAPI.createAgentinfo({ name, joblevel, description, annualleave, mandatoryworkday });
      if (result.statusCode === 400) errors.push(`[${name}] ${result.detail[0].constraints.isLength}`);
    }
    for (const u of updates) {
      const { id, name, joblevel, description, annualleave, mandatoryworkday } = u;
      const result = await agentAPI.updateAgentinfo(id, { name, joblevel, description, annualleave, mandatoryworkday });
      if (result.statusCode === 400) errors.push(`[${name}] ${result.detail[0].constraints.isLength}`);
    }
    for (const d of deletes) {
      const { id, name, joblevel, description, annualleave, mandatoryworkday } = d;
      const result = await agentAPI.deleteAgentinfo(id, { name, joblevel, description, annualleave, mandatoryworkday });
      if (result.statusCode === 400) errors.push(`[${name}] ${result.detail[0].constraints.isLength}`);
    }

    await syncAgentList();
    if (errors.length > 0) alert(errors.join("\n"));
  };

  const syncAgentList = async () => {
    console.log("syncAgentList");
    const result = await agentAPI.getAgentinfo();
    setAgentList(sortByJobRank(result.agentinfos));
    const count = await agentAPI.getAgentCount();
    setRows(count.response);
  };

  // 해당 연도 1월부터 지정한 달('YYYY-MM')까지의 인원별 누적 사용 연차 수를 서버에서 조회
  const fetchAnnualLeaveUsage = async (month: string) => {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    try {
      const result = await agentAPI.getAnnualLeaveUsage(month);
      setAnnualLeaveUsage(result?.usage ?? {});
    } catch (err) {
      console.error("fetchAnnualLeaveUsage error", err);
    }
  };

  // 특정 달('YYYY-MM')의 확정 휴일/연차(서버 저장본)를 조회
  const fetchMonthlySchedule = async (month: string) => {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    try {
      const result = await agentAPI.getMonthlySchedule(month);
      setMonthlySchedule(result?.leaves ?? []);
    } catch (err) {
      console.error("fetchMonthlySchedule error", err);
      setMonthlySchedule([]);
    }
  };

  // 스케줄 초기화: monthly_leaves DROP/재생성 + 모든 직원의 원하는 휴일/연차 신청 입력값 비움
  const resetMonthlyScheduleTable = async () => {
    const result = await agentAPI.resetMonthlyScheduleTable();
    if (result?.statusCode && result.statusCode !== 200) {
      alert(result.msg ?? "테이블 초기화에 실패했습니다.");
      return false;
    }
    setAnnualLeaveUsage({});
    setMonthlySchedule([]);
    await syncAgentList(); // 비워진 직원 입력값을 화면에 반영
    return true;
  };

  // 확정된 월 스케줄을 서버에 저장 (인원 x 월 별 통째 교체)
  const confirmSchedule = async (
    scheduleMonth: string,
    entries: {
      agentId: string;
      leaveDates: string[];
      annualLeaveDates: string[];
      compLeaveDates?: string[];
    }[]
  ) => {
    const result = await agentAPI.confirmMonthlySchedule({ scheduleMonth, entries });
    if (result?.statusCode && result.statusCode !== 200) {
      alert(result.msg ?? "스케줄 확정에 실패했습니다.");
      return false;
    }
    // 저장 후 해당 달 저장본 + 그 달까지의 누적 연차 갱신
    await fetchMonthlySchedule(scheduleMonth);
    await fetchAnnualLeaveUsage(scheduleMonth);
    return true;
  };

  const setSelectedDateList = async () => {
    const selectedDatesMapping: { [key: number]: {name:string; date:DateObject[]} } = {};
    const selectedleaveMapping:EventInput[] = [];
    const selectedANDatesMapping: { [key: number]: {name:string; date:DateObject[]} } = {};
    const selectedannualleaveMapping:EventInput[] = [];
    const selectedMWDatesMapping: { [key: number]: {name:string; date:DateObject[]} } = {};
    const selectedmandatoryworkMapping:EventInput[] = [];

    // 설정 표(DatePicker)에는 지금 보고 있는 달('YYYY-MM')의 값만 보여준다 — 없으면 빈칸, 있으면 그 달 값만.
    //  달을 바꿀 때마다 이 값도 다시 계산되도록 아래 useEffect 의존성 배열에 currentMonth 를 넣어뒀다.
    const monthPrefix = /^\d{4}-\d{2}$/.test(currentMonth) ? `${currentMonth}-` : null;

    if(agentList){
      const filteredinfo = agentList.map(({id, ...rest}) => rest); // id를 제외한 데이터로 변환
      filteredinfo.forEach((agent, rowid) => {
        const description = agent.description;
        const annualleave = agent.annualleave;
        const mandatory_workday = agent.mandatory_workday || '';
        const name = agent.name;
        // 빈 값('')은 날짜가 없는 것으로 처리 (초기화된 직원 등). 이 목록은 전체 달 이력 그대로 유지 —
        //  스케줄 생성 알고리즘(App.tsx)이 대상 월만 알아서 다시 걸러 쓴다.
        const serverDates = description.split(',').map((date: string) => date.trim()).filter((date: string) => date.length > 0);
        const serverANDates = annualleave.split(',').map((date: string) => date.trim()).filter((date: string) => date.length > 0);
        const serverMWDates = mandatory_workday.split(',').map((date: string) => date.trim()).filter((date: string) => date.length > 0);

        // 설정 표에 표시할 값은 지금 보는 달만 추림
        const monthDates = monthPrefix ? serverDates.filter((d: string) => d.startsWith(monthPrefix)) : serverDates;
        const monthANDates = monthPrefix ? serverANDates.filter((d: string) => d.startsWith(monthPrefix)) : serverANDates;
        const monthMWDates = monthPrefix ? serverMWDates.filter((d: string) => d.startsWith(monthPrefix)) : serverMWDates;

        const toDateObjects = (list: string[]) =>
          list.map((dateStr: string) => {
            const [year, month, day] = dateStr.split('-').map(Number);
            return new DateObject({ year, month, day });
          });

        selectedDatesMapping[rowid] = { name, date: toDateObjects(monthDates) };
        selectedANDatesMapping[rowid] = { name, date: toDateObjects(monthANDates) };
        selectedMWDatesMapping[rowid] = { name, date: toDateObjects(monthMWDates) };

        const eventInput:EventInput[] = serverDates.map((date: string) => {
          return {title:name,start:date};
        });
        selectedleaveMapping.push(...eventInput); //selectedleaveMapping에 eventInput 추가

        const eventANInput:EventInput[] = serverANDates.map((date: string) => {
          return {title:name,start:date};
        });
        selectedannualleaveMapping.push(...eventANInput); //selectedannualleaveMapping eventInput 추가

        const eventMWInput:EventInput[] = serverMWDates.map((date: string) => {
          return {title:name,start:date};
        });
        selectedmandatoryworkMapping.push(...eventMWInput); //selectedmandatoryworkMapping eventInput 추가
      });

      // setLeaveList 업데이트
      setLeaveList(selectedleaveMapping);

      // setAnnualLeaveList 업데이트
      setAnnualLeaveList(selectedannualleaveMapping);

      // selectedDates 업데이트
      setSelectedDates(selectedDatesMapping);

      // selectedDates 업데이트
      setSelectedAnnualleave(selectedANDatesMapping);

      // 필수 근무일 업데이트
      setMandatoryWorkList(selectedmandatoryworkMapping);
      setSelectedMandatoryWork(selectedMWDatesMapping);
    }
  };

  useEffect(() => {
    (async () => {
      const result = await agentAPI.getAgentinfo();
      setAgentList(sortByJobRank(result.agentinfos));
      const count = await agentAPI.getAgentCount();
      setRows(count.response);
    })();
  }, []);

  useEffect(() => {
    setSelectedDateList();
  }, [agentList, currentMonth]);

  // 달력에서 보고 있는 달이 바뀌면 그 달의 확정 저장본과 그 달까지의 누적 사용 연차를 다시 조회
  useEffect(() => {
    if (currentMonth && /^\d{4}-\d{2}$/.test(currentMonth)) {
      fetchMonthlySchedule(currentMonth);
      fetchAnnualLeaveUsage(currentMonth);
    }
  }, [currentMonth]);

  // 앱 시작 시 서버에 저장된 설정(보조직무 / 필수 근무 조건)을 불러와 적용
  useEffect(() => {
    (async () => {
      try {
        const result = await agentAPI.getSettings();
        const s = result?.settings ?? {};
        if (Array.isArray(s.subjob1)) setSelectedSubjob1(s.subjob1);
        if (Array.isArray(s.subjob2)) setSelectedSubjob2(s.subjob2);
        if (Array.isArray(s.essentialWork) && s.essentialWork.length >= 5)
          setScheduleEssentialWork(s.essentialWork);
        if (typeof s.directorFullQuota === "boolean") setDirectorFullQuota(s.directorFullQuota);
      } catch (err) {
        console.error("getSettings error", err);
      } finally {
        appSettingsLoadedRef.current = true;
      }
    })();
  }, []);

  // 보조직무 / 필수 근무 조건 / 점장 휴무 방식이 바뀌면 (최초 로드 이후) 디바운스 후 서버에 자동 저장
  useEffect(() => {
    if (!appSettingsLoadedRef.current) return;
    const timer = setTimeout(() => {
      agentAPI
        .updateSettings({
          subjob1: selectedSubjob1,
          subjob2: selectedSubjob2,
          essentialWork: scheduleEssentialWork,
          directorFullQuota,
        })
        .catch((err) => console.error("updateSettings error", err));
    }, 800);
    return () => clearTimeout(timer);
  }, [selectedSubjob1, selectedSubjob2, scheduleEssentialWork, directorFullQuota]);

  return (
    <AgentContext.Provider
      value={{
        handleCreateAgent,
        handleUpdateAgent,
        handleDeleteAgent,
        handleBulkSaveAgents,
        rows,
        agentList,
        selectedDates,
        selectedAnnualleave,
        selectedMandatoryWork,
        leaveList,
        annualLeaveList,
        mandatoryWorkList,
        scheduleEssentialWork,
        directorFullQuota,
        selectedSubjob1,
        selectedSubjob2,
        currentMonth,
        annualLeaveUsage,
        fetchAnnualLeaveUsage,
        monthlySchedule,
        fetchMonthlySchedule,
        confirmSchedule,
        resetMonthlyScheduleTable,
        setLeaveList,
        syncAgentList,
        setSelectedDates,
        setSelectedAnnualleave,
        setSelectedMandatoryWork,
        setSelectedDateList,
        setScheduleEssentialWork,
        setDirectorFullQuota,
        setSelectedSubjob1,
        setSelectedSubjob2,
        setCurrentMonth,
      }}
    >
      {children}
    </AgentContext.Provider>
  );
};

// Context를 사용하기 위한 커스텀 훅
export const useAgent = () => {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error("useAgent must be used within an AgentProvider");
  }
  return context;
};
