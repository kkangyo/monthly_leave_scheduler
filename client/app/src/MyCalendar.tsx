import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import {
  EventInput,
  DatesSetArg,
  DayCellContentArg,
  DayCellMountArg,
  EventDropArg,
  EventClickArg,
  EventContentArg,
} from '@fullcalendar/core';
import { DateClickArg } from '@fullcalendar/interaction';
import './MyCalendar.css'
import { useAgent } from "./hooks/useAgentinfo";
import { getHolidayName, ymd } from "./koreanHolidays";

interface MyCalendarProps {
  events: EventInput[];
  editable?: boolean;                          // 생성 미리보기일 때만 true
  onEventDrop?: (info: EventDropArg) => void;    // 휴무를 다른 날짜로 드래그했을 때
  onEventClick?: (info: EventClickArg) => void;  // 휴무 클릭 → 삭제 아이콘 토글
  eventContent?: (arg: EventContentArg) => React.ReactNode; // 이벤트 커스텀 렌더 (삭제 아이콘 포함)
  onDateClick?: (info: DateClickArg) => void;    // 빈 날짜 클릭 → 추가 UI 토글
  renderDayExtra?: (dateStr: string) => React.ReactNode;    // 날짜 셀에 덧붙일 내용 (추가 UI)
}

const MyCalendar: React.FC<MyCalendarProps> = ({
  events,
  editable = false,
  onEventDrop,
  onEventClick,
  eventContent,
  onDateClick,
  renderDayExtra,
}) => {
  const { setCurrentMonth } = useAgent();
  // 날짜별 "인원 추가" 위젯을 꽂을 실제 DOM 노드 (휴무 목록 뒤에 이어 붙임, dayCellDidMount 에서 확보)
  const [extraEls, setExtraEls] = useState<Record<string, HTMLDivElement>>({});

  const handleDatesSet = (arg: DatesSetArg) => {
    const currentDate = arg.view.currentStart;
    const year = currentDate.getFullYear();
    const month = (currentDate.getMonth() + 1).toString().padStart(2, "0");
    const yearMonth = `${year}-${month}`;

    setCurrentMonth(yearMonth);
  };

  // 공휴일 셀에 클래스 추가 (배경/글자색은 CSS 에서 처리)
  const dayCellClassNames = (arg: DayCellContentArg) =>
    getHolidayName(arg.date) ? ["kr-holiday"] : [];

  // 날짜 숫자 + (공휴일이면) 공휴일 이름만 표시 (상단 영역). 인원 추가 위젯은 포털로 하단에 별도 표시.
  const dayCellContent = (arg: DayCellContentArg) => {
    const name = getHolidayName(arg.date);
    return (
      <div className="kr-day-cell">
        <span className="kr-day-num">{arg.dayNumberText}</span>
        {name && <span className="kr-holiday-name">{name}</span>}
      </div>
    );
  };

  // dayCellContent 는 셀 상단(날짜 숫자) 영역에만 꽂히므로, 휴무 목록 뒤에 보이게 하려면
  // 실제 셀 프레임(.fc-daygrid-day-frame, 휴무 목록 다음)에 직접 DOM 노드를 붙이고 포털로 렌더한다.
  const dayCellDidMount = (arg: DayCellMountArg) => {
    const frame = arg.el.querySelector(".fc-daygrid-day-frame");
    if (!frame) return;
    let portalEl = frame.querySelector(":scope > .kr-day-add-portal") as HTMLDivElement | null;
    if (!portalEl) {
      portalEl = document.createElement("div");
      portalEl.className = "kr-day-add-portal";
      frame.appendChild(portalEl);
    }
    const key = ymd(arg.date);
    setExtraEls((prev) => (prev[key] === portalEl ? prev : { ...prev, [key]: portalEl! }));
  };

  const dayCellWillUnmount = (arg: DayCellMountArg) => {
    const key = ymd(arg.date);
    setExtraEls((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // 바깥 래퍼는 가로 스크롤 영역: 달력은 최소 너비(MyCalendar.css)보다 줄어들지 않고,
  // 화면이 그보다 좁으면 좌우 드래그/스크롤로 본다.
  return (
    <div className="calendar-scroll">
    <div className="optimized_calendar">
      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: '',
          center: 'prev title next', // 이전 달 버튼은 월 텍스트 왼쪽, 다음 달 버튼은 오른쪽
          right: '',
        }}
        events={events}
        editable={editable}          // 미리보기일 때만 드래그 이동 허용
        eventDurationEditable={false}
        eventDrop={onEventDrop}
        eventClick={onEventClick}
        eventContent={eventContent}
        dateClick={onDateClick}
        datesSet={handleDatesSet} // 현재 달 변경 감지
        dayCellClassNames={dayCellClassNames}
        dayCellContent={dayCellContent}
        dayCellDidMount={dayCellDidMount}
        dayCellWillUnmount={dayCellWillUnmount}
        fixedWeekCount={false}
      />
      {renderDayExtra &&
        Object.entries(extraEls).map(([dateStr, el]) =>
          createPortal(renderDayExtra(dateStr), el, dateStr)
        )}
    </div>
    </div>
  );
};

export default MyCalendar;
