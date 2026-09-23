import React, { useEffect, useState } from 'react';
import Modal from 'react-modal';
import {useAgent} from "./hooks/useAgentinfo";
import DatePicker from 'react-multi-date-picker';
import "react-multi-date-picker/styles/layouts/mobile.css";
import "react-multi-date-picker/styles/colors/green.css";
import { DateObject } from 'react-multi-date-picker'; // DateObject를 임포트
import './styles.css';

export interface Agent {
  id: string;
  name: string;
  job_level: string;
  description: string;
  annualleave: string;
  mandatory_workday: string;
  ischecked?: boolean; // 체크하면 '선택 삭제' 버튼이 나타나고, '전체 저장' 시에도 삭제 대상
}

Modal.setAppElement('#root');

interface TableProps {
  onResetAll?: () => void; // 전체 초기화(스케줄·휴일 입력) 버튼 클릭 핸들러 — App.tsx 소유 로직
  isResetting?: boolean; // 초기화 진행 중이면 버튼 비활성화
}

const Table: React.FC<TableProps> = ({ onResetAll, isResetting }) => {
  const {
    agentList,
    selectedDates,
    selectedAnnualleave,
    selectedMandatoryWork,
    handleBulkSaveAgents,
    setSelectedDates,
    setSelectedAnnualleave,
    setSelectedMandatoryWork,
    setSelectedDateList,
    scheduleEssentialWork,
    directorFullQuota,
    selectedSubjob1,
    selectedSubjob2,
    setScheduleEssentialWork,
    setDirectorFullQuota,
    setSelectedSubjob1,
    setSelectedSubjob2,
    annualLeaveUsage,
    currentMonth,
  } = useAgent();

  const [data, setData] = useState<Agent[]>([]); // Agent[] 타입으로 초기화
  const [isModalOpen, setIsModalOpen] = useState(false); // 모달 열기/닫기 상태
  const [modalMessage, setModalMessage] = useState(""); // 모달에 표시할 메시지
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null); // 확인 버튼에서 실행할 함수 저장

  // 수동으로 열 너비 설정
  const columnWidths = [90, 110, 250, 200, 200, 100];

  // 스케줄 관련 너비 , Header 설정
  const colWidthSetSchedule2 = [100, 150, 100, 100, 100];
  const headerNamesSetSchedule2 = ['1인당 휴일','평일 근무 인원(주말+1)','최소 책임급 수','필수 1층 인원', '필수 2층 인원'];
  
  const colWidthHeaderSubjobs = [160, 160];
  const colWidthSubjobs = [80, 80, 80, 80];
  const headerNamesSubjobs = ['온라인 업무','RT 업무'];

  // Header 이름 설정
  const headerNames = ['이름','직무 등급','원하는 휴일', '연차 신청', '필수 근무일', '누적 사용 연차'];
  // 수동으로 열 수정 가능 여부 설정 (마지막 '누적 사용 연차'는 읽기 전용)
  const editableColumns = [true, true, true, true, true, false];

  // agentList를 기반으로 데이터 설정
  useEffect(() => {
    if (agentList) {
      console.log("useEffect agentList :",agentList);
      setData(agentList);
    }
  }, [agentList]);

  useEffect(() => {

  }, [scheduleEssentialWork]); // data가 변경될 때마다 실행됨

  // 새로운 행 추가 함수
  const addRow = () => {
    const newRow: Agent = { id: '', name: '', job_level: '', description: '', annualleave: '', mandatory_workday: ''}; // 기본값을 가진 새 행
    setData([...data, newRow]);
  };

  const openModal = (message: string, onConfirm: () => void) => {
    setModalMessage(message); // 모달 메시지 설정
    setConfirmAction(() => onConfirm); // 확인 시 실행할 함수 설정
    setIsModalOpen(true); // 모달 열기
  };

  // 모달 닫기
  const closeModal = () => {
    setIsModalOpen(false); // 모달 닫기
  };

  // 확인 버튼 클릭 시 처리할 작업
  const handleConfirm = () => {
    if (confirmAction) {
      confirmAction(); // 저장된 확인 함수 실행
      closeModal(); // 모달 닫기
    }
  };

  // 취소 버튼 클릭 시 모달 닫기
  const handleCancel = () => {
    closeModal(); // 모달 닫기
  };

  // DateObject[] → "YYYY-MM-DD, ..." 콤마 문자열 (저장용)
  const formatDateList = (dates?: DateObject[]): string => {
    if (!dates || dates.length === 0) return '';
    return dates
      .map((date) => {
        const d = date.toDate();
        return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d
          .getDate()
          .toString()
          .padStart(2, '0')}`;
      })
      .join(', ');
  };

  // 콤마 날짜 문자열 두 개가 (순서·공백 무관하게) 같은 날짜 집합인지 비교
  const sameDateString = (a: string, b: string): boolean => {
    const norm = (s: string) =>
      s.split(',').map((d) => d.trim()).filter(Boolean).sort().join(',');
    return norm(a || '') === norm(b || '');
  };

  // 표의 DatePicker 는 지금 보는 달('YYYY-MM')만 보여준다(useAgentinfo.tsx). 그래서 저장할 때는
  //  원본 전체 문자열에서 그 달에 해당하는 날짜만 지금 입력된 값으로 바꿔치기하고, 다른 달 값은 그대로 둔다.
  //  (그냥 formatDateList 결과로 통째 덮어쓰면 지금 안 보이는 다른 달 데이터가 다 날아간다.)
  const mergeMonthDates = (original: string, month: string, monthValue: string): string => {
    const keepOtherMonths = (original || '')
      .split(',')
      .map((d) => d.trim())
      .filter((d) => d.length > 0 && !d.startsWith(`${month}-`));
    const thisMonth = (monthValue || '')
      .split(',')
      .map((d) => d.trim())
      .filter((d) => d.length > 0);
    return [...keepOtherMonths, ...thisMonth].sort().join(', ');
  };

  // 표 전체 일괄 저장: 각 행을 현재 날짜 선택 상태(selectedDates 등) 기준으로 신규/수정/삭제로 분류해 한 번에 반영.
  //  기존 직원(id 있음)은 원본(agentList)과 비교해 실제로 값이 바뀐 행만 '수정'으로 포함한다.
  const handleSaveAll = () => {
    const originalById = new Map<string, Agent>((agentList ?? []).map((a: Agent) => [a.id, a]));
    const isValidMonth = /^\d{4}-\d{2}$/.test(currentMonth);

    const creates: { name: string; joblevel: string; description: string; annualleave: string; mandatoryworkday: string }[] = [];
    const updates: { id: string; name: string; joblevel: string; description: string; annualleave: string; mandatoryworkday: string }[] = [];
    const deletes: { id: string; name: string; joblevel: string; description: string; annualleave: string; mandatoryworkday: string }[] = [];

    data.forEach((row, rowIndex) => {
      if (!row.name && !row.job_level) return; // 아직 아무것도 입력 안 한 빈 새 행은 건너뜀

      const original = row.id ? originalById.get(row.id) : undefined;
      const monthDescription = formatDateList(selectedDates[rowIndex]?.date);
      const monthAnnualleave = formatDateList(selectedAnnualleave[rowIndex]?.date);
      const monthMandatoryworkday = formatDateList(selectedMandatoryWork[rowIndex]?.date);

      const entry = {
        name: row.name,
        joblevel: row.job_level,
        description:
          original && isValidMonth ? mergeMonthDates(original.description, currentMonth, monthDescription) : monthDescription,
        annualleave:
          original && isValidMonth ? mergeMonthDates(original.annualleave, currentMonth, monthAnnualleave) : monthAnnualleave,
        mandatoryworkday:
          original && isValidMonth
            ? mergeMonthDates(original.mandatory_workday, currentMonth, monthMandatoryworkday)
            : monthMandatoryworkday,
      };

      if (row.ischecked) {
        if (row.id) deletes.push({ id: row.id, ...entry }); // 저장된 적 없는 새 행 체크는 그냥 무시(어차피 서버에 없음)
      } else if (row.id) {
        const changed =
          !original ||
          row.name !== original.name ||
          row.job_level !== original.job_level ||
          !sameDateString(entry.description, original.description) ||
          !sameDateString(entry.annualleave, original.annualleave) ||
          !sameDateString(entry.mandatoryworkday, original.mandatory_workday);
        if (changed) updates.push({ id: row.id, ...entry });
      } else {
        creates.push(entry);
      }
    });

    if (creates.length + updates.length + deletes.length === 0) {
      alert('저장할 변경 사항이 없습니다.');
      return;
    }

    openModal(
      `추가 ${creates.length}건 · 수정 ${updates.length}건 · 삭제 ${deletes.length}건을 반영할까요?`,
      () => handleBulkSaveAgents(creates, updates, deletes)
    );
  };

  // 체크된 인원 목록 (서버에 저장된 적 있는 행만 — 삭제 버튼 노출/실행 대상)
  const checkedRows = data.filter((row) => row.ischecked && row.id);

  // 체크박스로 선택한 인원만 바로 삭제
  const handleDeleteChecked = () => {
    if (checkedRows.length === 0) return;
    const deletes = checkedRows.map((row) => ({
      id: row.id,
      name: row.name,
      joblevel: row.job_level,
      description: row.description,
      annualleave: row.annualleave,
      mandatoryworkday: row.mandatory_workday,
    }));
    openModal(`선택한 ${deletes.length}명을 삭제할까요?`, () => handleBulkSaveAgents([], [], deletes));
  };

  const handleDateChange = (rowIndex: number, dates: DateObject[]) => {
    if(!selectedDates[rowIndex]){
      selectedDates[rowIndex] = {name:"", date:[]};
    }
    selectedDates[rowIndex].date = dates;
    setSelectedDates(selectedDates);
  };

  const handleDatePickerClose = (rowIndex: number) => { // DatePicker가 닫힐 때 호출되는 함수
    if(selectedDates[rowIndex]){
      const formattedDates = selectedDates[rowIndex].date.map((date: DateObject) => {
          const dateInstance = date.toDate();
          const year = dateInstance.getFullYear();
          const month = dateInstance.getMonth() + 1;
          const day = dateInstance.getDate();
          return `${year}-`+ month.toString().padStart(2, "0") + `-`+ day.toString().padStart(2, "0"); // 월/일 형식으로 변환
        })
        .join(", "); // 여러 날짜들을 쉼표로 구분하여 연결
      // 잘못된 것이 들어있으면 return
      if(formattedDates.includes("NaN")) return;
      // 상태를 처리하는 함수 호출
      handleInputChange(rowIndex, 'description', formattedDates);
    }
  };

  const handle_AN_DateChange = (rowIndex: number, dates: DateObject[]) => {
    console.log("handle_AN_DateChange : row " + rowIndex + ", dates " + dates);
    if(!selectedAnnualleave[rowIndex]){
      selectedAnnualleave[rowIndex] = {name:"", date:[]};
    }
    selectedAnnualleave[rowIndex].date = dates;
    setSelectedAnnualleave(selectedAnnualleave);
  };

  const handle_AN_DatePickerClose = (rowIndex: number) => { // DatePicker가 닫힐 때 호출되는 함수
    if(selectedAnnualleave[rowIndex]){
      const formattedDates = selectedAnnualleave[rowIndex].date.map((date: DateObject) => {
          const dateInstance = date.toDate();
          const year = dateInstance.getFullYear();
          const month = dateInstance.getMonth() + 1;
          const day = dateInstance.getDate();
          return `${year}-`+ month.toString().padStart(2, "0") + `-`+ day.toString().padStart(2, "0"); // 월/일 형식으로 변환
        })
        .join(", "); // 여러 날짜들을 쉼표로 구분하여 연결
      // 잘못된 것이 들어있으면 return
      if(formattedDates.includes("NaN")) return;
      // 상태를 처리하는 함수 호출
      handleInputChange(rowIndex, 'annualleave', formattedDates);
    }
  };

  const handleMW_DateChange = (rowIndex: number, dates: DateObject[]) => {
    if(!selectedMandatoryWork[rowIndex]){
      selectedMandatoryWork[rowIndex] = {name:"", date:[]};
    }
    selectedMandatoryWork[rowIndex].date = dates;
    setSelectedMandatoryWork(selectedMandatoryWork);
  };

  const handleMW_DatePickerClose = (rowIndex: number) => { // DatePicker가 닫힐 때 호출되는 함수
    if(selectedMandatoryWork[rowIndex]){
      const formattedDates = selectedMandatoryWork[rowIndex].date.map((date: DateObject) => {
          const dateInstance = date.toDate();
          const year = dateInstance.getFullYear();
          const month = dateInstance.getMonth() + 1;
          const day = dateInstance.getDate();
          return `${year}-`+ month.toString().padStart(2, "0") + `-`+ day.toString().padStart(2, "0");
        })
        .join(", ");
      if(formattedDates.includes("NaN")) return;
      handleInputChange(rowIndex, 'mandatory_workday', formattedDates);
    }
  };

  const handleInputChange = (rowIndex: number, field: keyof Agent, value: string) => {
    setData(prevData => {
      const newData = prevData.map((row, rIdx) =>
        rIdx === rowIndex ? { ...row, [field]: value, isNew: true } : row
      );
      return newData; // 최신 데이터 반환
    });
  };

  const handleSubjob1Change = (colIndex: number, value: string) => {
    setSelectedSubjob1((prev: string[]) => {
      const next = [...prev];
      next[colIndex] = value;
      return next;
    });
  };

  const handleSubjob2Change = (colIndex: number, value: string) => {
    setSelectedSubjob2((prev: string[]) => {
      const next = [...prev];
      next[colIndex] = value;
      return next;
    });
  };

  const handlePresetWorkNumberChange = (colIndex: number, value: string) => {
    const numericValue = parseFloat(value);
    setScheduleEssentialWork((prev: number[]) => {
      if (prev[colIndex] !== numericValue) {
        return prev.map((item, index) =>
          index === colIndex ? (isNaN(numericValue) ? 0 : numericValue) : item
        );
      }
      return prev;
    });
  };

  const handleDirectorFullQuotaChange = (value: string) => {
    setDirectorFullQuota(value === "true");
  };

  const handleCheckboxChange = (rowIndex: number, checked: boolean) => {
    const newData = data.map((row, rIdx) => {
      if(rIdx === rowIndex){
        row.ischecked = checked;
        return row;
      }
      return row;
    });
    setData(newData);
  };

  // Header Table의 Checkbox 설정 (전체 선택 → '전체 저장' 시 전원 삭제 대상)
  const handleHeaderCheckboxChange = (checked: boolean) => {
    const newData = data.map((row) => {
      row.ischecked = checked;
      return row;
    });
    setData(newData);
  };

  return (
    <div>
      <table className='table-style'>
        <colgroup>
          {colWidthSetSchedule2.map((width, colIndex) => (
            <col key={colIndex} style={{ width: `${width}px` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {colWidthSetSchedule2.map((width, colIndex) => (
              <th key={colIndex} style={{ width: `${width}px` }}>
                {headerNamesSetSchedule2[colIndex]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {colWidthSetSchedule2.map((width, colIndex) => (
              <td key={colIndex} style={{ width: `${width}px` }}>
                <input
                  type="text"
                  value={scheduleEssentialWork[colIndex]}
                  onChange={(e) => handlePresetWorkNumberChange(colIndex, e.target.value)}
                />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <div style={{ height: "20px" }}></div> {/* 여백 추가 */}
      <div style={{ display: 'flex', gap: '30px', alignItems: 'flex-start' }}>
        <table className='table-style'>
          <colgroup>
            <col style={{ width: '200px' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ width: '200px' }}>점장 휴무 방식</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ width: '200px' }}>
                <select
                  value={directorFullQuota ? "true" : "false"}
                  onChange={(e) => handleDirectorFullQuotaChange(e.target.value)}
                >
                  <option value="false">사전 확정 휴무일에만 쉼</option>
                  <option value="true">직원과 동일하게 의무 휴무 적용</option>
                </select>
              </td>
            </tr>
          </tbody>
        </table>
        <table className='table-style'>
          <colgroup>
            {colWidthSubjobs.map((width, colIndex) => (
              <col key={colIndex} style={{ width: `${width}px` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {colWidthHeaderSubjobs.map((width, colIndex) => (
                <th key={colIndex} colSpan={2} style={{ width: `${width}px` }}>
                  {headerNamesSubjobs[colIndex]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {colWidthSubjobs.map((width, colIndex) => (
                <td key={colIndex} style={{ width: `${width}px` }}>
                  <select
                    value={colIndex < 2 ? selectedSubjob1[colIndex] : selectedSubjob2[colIndex - 2]}
                    onChange={(e) => colIndex < 2 ? handleSubjob1Change(colIndex, e.target.value) : handleSubjob2Change(colIndex - 2, e.target.value)}>
                    <option value="">직원 선택</option>
                    {data.map((peoples: Agent, peopleIndex) => (
                      <option key={peoples.id || peopleIndex} value={peoples.name}>{peoples.name}</option>
                    ))}
                  </select>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ height: "20px" }}></div> {/* 여백 추가 */}
      {/* 직원 표: <table>의 table-layout:fixed + colgroup 조합이 특정 칸에서 지정한 width를 무시하고
          훨씬 좁게 렌더하는, 재현 원인을 특정 못 한 문제가 있어 이 표만 CSS Grid 로 전환했다.
          grid-template-columns 는 지정한 px 값이 예외 없이 그대로 트랙 너비가 되어 이런 모호함이 없다. */}
      <div
        className="emp-grid"
        style={{ gridTemplateColumns: `40px ${columnWidths.map((w) => `${w}px`).join(' ')}` }}
      >
        <div className="emp-grid-cell emp-grid-header">
          <input
            type="checkbox"
            onChange={(e) => handleHeaderCheckboxChange(e.target.checked)}
          />
        </div>
        {headerNames.map((name, colIndex) => (
          <div key={colIndex} className="emp-grid-cell emp-grid-header">
            {name}
          </div>
        ))}

        {data.map((row, rowIndex) => {
          const altClass = rowIndex % 2 === 1 ? ' emp-grid-alt' : '';
          return (
            <React.Fragment key={rowIndex}>
              <div className={`emp-grid-cell${altClass}`}>
                <input
                  type="checkbox"
                  checked={row.ischecked}
                  onChange={(e) => handleCheckboxChange(rowIndex, e.target.checked)}
                />
              </div>
              {['name', 'job_level', 'description', 'annualleave', 'mandatory_workday'].map((field, colIndex) => (
                <div key={colIndex} className={`emp-grid-cell${altClass}`}>
                  {field === "job_level" ? (
                    <select
                      value={row[field as keyof Agent] as string}
                      onChange={(e) => handleInputChange(rowIndex, field as keyof Agent, e.target.value)}
                    >
                      <option value="">직무를 선택하세요</option>
                      <option value="점장">점장</option>
                      <option value="1층 매니저">1층 매니저</option>
                      <option value="2층 매니저">2층 매니저</option>
                      <option value="2층 부점장">2층 부점장</option>
                      <option value="1층 대리">1층 대리</option>
                      <option value="2층 대리">2층 대리</option>
                      <option value="1층 사원">1층 사원</option>
                      <option value="2층 사원">2층 사원</option>
                    </select>
                  ) : field === "description" ? (
                    <DatePicker
                      style={{ width: "250px" }}
                      onChange={(dates: DateObject[]) => handleDateChange(rowIndex, dates)}
                      onClose={() => handleDatePickerClose(rowIndex)}
                      value={selectedDates[rowIndex]?.date || []}
                      multiple
                      readOnly={!editableColumns[colIndex]}
                      format="MM/DD"
                      calendarPosition="bottom-center"
                      className="black"
                    />
                  ) : field === "annualleave" ? (
                    <DatePicker
                    style={{ width: "250px" }}
                      onChange={(dates: DateObject[]) => handle_AN_DateChange(rowIndex, dates)}
                      onClose={() => handle_AN_DatePickerClose(rowIndex)}
                      value={selectedAnnualleave[rowIndex]?.date || []}
                      multiple
                      readOnly={!editableColumns[colIndex]}
                      format="MM/DD"
                      calendarPosition="bottom-center"
                      className="black"
                    />
                  ) : field === "mandatory_workday" ? (
                    <DatePicker
                      style={{ width: "250px" }}
                      onChange={(dates: DateObject[]) => handleMW_DateChange(rowIndex, dates)}
                      onClose={() => handleMW_DatePickerClose(rowIndex)}
                      value={selectedMandatoryWork[rowIndex]?.date || []}
                      multiple
                      readOnly={!editableColumns[colIndex]}
                      format="MM/DD"
                      calendarPosition="bottom-center"
                      className="black"
                    />
                  ) : (
                    <input
                      type="text"
                      value={row[field as keyof Agent] as string}
                      onChange={(e) => handleInputChange(rowIndex, field as keyof Agent, e.target.value)}
                      readOnly={!editableColumns[colIndex]}
                    />
                  )}
                </div>
              ))}
              <div className={`emp-grid-cell${altClass}`} style={{ justifyContent: 'center' }}>
                {(annualLeaveUsage && annualLeaveUsage[row.id]) || 0}
              </div>
            </React.Fragment>
          );
        })}
      </div>
      {/* 인원 추가는 왼쪽, 전체 저장(+선택 삭제)은 가운데, 전체 초기화는 오른쪽에 고정.
          다른 두 버튼 너비와 무관하게 가운데 버튼이 정확히 중앙에 오도록 3열 grid 사용 */}
      <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          marginTop: '10px', // 버튼 위쪽에 여백 추가
        }}>
        <div style={{ justifySelf: 'start' }}>
          <button className="btn btn-secondary" onClick={addRow}> 인원 추가 </button>
        </div>
        <div style={{ justifySelf: 'center', display: 'flex', gap: '10px' }}>
          <button className="btn" onClick={handleSaveAll}> 전체 저장 </button>
          {checkedRows.length > 0 && (
            <button className="btn btn-danger" onClick={handleDeleteChecked}>
              선택 삭제 ({checkedRows.length})
            </button>
          )}
        </div>
        <div style={{ justifySelf: 'end' }}>
          {onResetAll && (
            <button className="btn btn-danger" onClick={onResetAll} disabled={isResetting}>
              전체 초기화
            </button>
          )}
        </div>
      </div>
      <div style={{ height: "40px" }}></div> {/* 여백 추가 */}

      <Modal
        isOpen={isModalOpen}
        onRequestClose={handleCancel} // 모달 외부 클릭 시 닫기
        contentLabel="Action Confirmation"
        style={{
          overlay: {
            backgroundColor: 'rgba(255, 255, 255, 0.8)', // 흰색 반투명 배경
            zIndex: 1000, // 다른 콘텐츠 위로 띄우기
          },
          content: {
            backgroundColor: 'white', // 모달 배경 색을 흰색으로 설정
            padding: '24px 20px', // padding을 줄여서 세로 크기 조절
            borderRadius: '10px',
            width: '280px',
            height: 'auto', // 모달의 세로 크기 설정
            margin: '0 auto',
            top: '50%', // 화면 중앙에서 50% 위치
            left: '0%', // 화면 중앙에서 50% 위치
            boxShadow: '0 4px 10px rgba(0, 0, 0, 0.2)', // 모달 그림자
          },
        }}
      >
        <h2 style={{
          fontSize: '17px',
          textAlign: 'center',
          alignItems: 'center'
         }}>{modalMessage}</h2>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          // justifyContent: 'space-between', // 버튼 간격을 양쪽으로 조정
          gap: '12px', // 버튼 간의 간격을 10px로 설정
          marginTop: '24px', // 버튼 위쪽에 여백 추가
        }}>
          <button className="btn" onClick={handleConfirm}>확인</button>
          <button className="btn btn-secondary" onClick={handleCancel}>취소</button>
        </div>
      </Modal>
    </div>
  );
};

export default Table;