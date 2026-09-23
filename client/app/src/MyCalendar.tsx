import React from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import {
  EventInput,
  DatesSetArg,
  DayCellContentArg,
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

  // 날짜 숫자 + (공휴일이면) 공휴일 이름 + (추가 UI가 열려있으면) 인원 추가 위젯 표시
  const dayCellContent = (arg: DayCellContentArg) => {
    const name = getHolidayName(arg.date);
    return (
      <div className="kr-day-cell">
        <span className="kr-day-num">{arg.dayNumberText}</span>
        {name && <span className="kr-holiday-name">{name}</span>}
        {renderDayExtra && renderDayExtra(ymd(arg.date))}
      </div>
    );
  };

  return (
    <div className="optimized_calendar">
      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: 'prev,next',
          center: 'title',
          right: 'dayGridMonth',
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
        fixedWeekCount={false}
      />
    </div>
  );
};

export default MyCalendar;
