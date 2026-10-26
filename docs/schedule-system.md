# 직원 휴무 스케줄 시스템 정리

매장 직원들의 **월 단위 휴무(휴일 + 연차) 스케줄**을 자동 생성하고, 확정된 스케줄을
서버에 이력으로 저장·조회하는 기능에 대한 문서.

- 클라이언트: `client/app` (React + TypeScript, react-scripts, FullCalendar)
- 서버: `server/app` (Express + TypeScript + mysql2)
- 핵심 파일
  - 알고리즘: [`client/app/src/App.tsx`](../client/app/src/App.tsx) `generateLeaveSchedule()`
  - 상태/통신 훅: [`client/app/src/hooks/useAgentinfo.tsx`](../client/app/src/hooks/useAgentinfo.tsx)
  - 입력 표: [`client/app/src/ReactTable.tsx`](../client/app/src/ReactTable.tsx)
  - 달력: [`client/app/src/MyCalendar.tsx`](../client/app/src/MyCalendar.tsx) / 공휴일 데이터 [`koreanHolidays.ts`](../client/app/src/koreanHolidays.ts)
  - 서버: `server/app/src/apis/agentinfo/*`, `service/agentinfo.ts`, `model/agentinfoRepository.ts`
  - 스키마: [`server/.db/initdb.d/create_table.sql`](../server/.db/initdb.d/create_table.sql)

---

## 1. 전체 그림

```
[ReactTable 입력 (⚙ 설정 모달)]    [App.tsx]                        [server /apis/agentinfo]        [MySQL]
 직원(이름/직무, 직급순 정렬) ──►  agentList ──────────────────────► GET  /infos ───────────────►  agent_informations
 원하는 휴일/연차/필수근무일      leaveList/annualLeaveList/         POST /infos
 (지금 보는 달만 표시·수정)       mandatoryWorkList                 PATCH/DELETE /infos/:id
 매장 필수 조건 5개 + 점장 휴무   scheduleEssentialWork /
 방식, 보조직무                   directorFullQuota
                                  + koreanHolidays.ts (자동 반영, 수동 휴일 입력 없음)

[달력에서 달 이동] ──► currentMonth 변경
        │
        ├─► GET /schedule?month=YYYY-MM      ─► monthly_leaves (해당 월 확정본)  ─► 달력 표시
        └─► GET /annual-leave/usage?month=… ─► monthly_leaves (1월~해당월 연차)  ─► 표의 "누적 사용 연차"

[휴무 생성] ─► generateLeaveSchedule() ─► 화면에만 제안 표시 (미저장, 달력에서 드래그·추가·삭제로 수정 가능)
[확정]      ─► POST /schedule/confirm  ─► monthly_leaves 에 인원별 해당 월 통째 교체 저장
[전체 초기화, ⚙ 설정 안] ─► POST /schedule/reset ─► monthly_leaves DROP&CREATE + 직원 입력값 비움
```

생성 결과는 확정을 눌러야 서버에 저장되고, 달을 바꾸면 그 달의 확정 저장본이 자동으로 달력에 그려진다.

---

## 2. 화면 기능

### 2.1 입력 표 (`ReactTable.tsx`, 메인 화면의 **⚙ 설정** 버튼을 눌러야 뜨는 모달 안에 위치)

| 표 | 항목 | 저장 위치 |
|---|---|---|
| 직원 표 | 이름, 직무 등급, **휴무 일수**, 원하는 휴일, 연차 신청, 필수 근무일, **누적 사용 연차(읽기전용)** | `agent_informations` (앞 6개 — 휴무 일수는 `leave_days` 정수(기본 8), 날짜 3개는 `"YYYY-MM-DD, ..."` 콤마 문자열) / `monthly_leaves` 집계(마지막). **직급순 정렬**(점장>부점장>매니저>대리>사원, 같은 직급이면 1층<2층) |
| 필수 조건 | `평일 근무 인원(주말+1)`, `최소 책임급 수`, `필수 1층 인원`, `필수 2층 인원` | `app_settings.essentialWork` (JSON 배열). 기본값 `[8,6,1,3,2]` — 0번(옛 `1인당 휴일`)은 인원별 휴무 일수로 대체되어 화면에 안 나오고 알고리즘도 안 읽음(배열 순서 유지용) |
| 점장 휴무 방식 | "사전 확정 휴무일에만 쉼" / "직원과 동일하게 의무 휴무 적용" | `app_settings.directorFullQuota` (boolean, 기본 `false`) |
| 보조직무 | 온라인 업무 2명, RT 업무 2명 | `app_settings.subjob1`/`subjob2` |

`app_settings` 항목은 변경 시 800ms 디바운스 후 `PUT /settings` 로 자동 저장, 앱 시작 시 `GET /settings` 로 로드.

직원 표의 **휴무 일수**는 그 직원이 한 달에 쉬는 의무 휴무일수(연차 제외)로, 달과 무관하게 인원별로 하나의 값이다.
새 인원은 8 로 시작하고, 빈칸·0~31 밖의 값은 저장 시 8 로 처리된다.

직원 표의 **원하는 휴일 / 연차 신청 / 필수 근무일**은 서버에는 인원당 전체 기간이 한 콤마 문자열로 저장되지만,
화면에는 **지금 달력에서 보고 있는 달의 날짜만** 표시·수정된다(달을 바꾸면 그 달 값으로 다시 불러옴, 없으면 빈칸).
저장 시에는 그 달 값만 새로 교체하고 다른 달 값은 그대로 보존한다(`mergeMonthDates`).

직원 표는 행마다 저장 버튼이 있지 않고, 표 하단 **전체 저장** 버튼 한 번으로 신규 추가/실제로 값이 바뀐 행만 수정/체크된 행 삭제를
한 번에 반영한다(`POST`/`PATCH`/`DELETE /infos` 를 모아서 실행 후 목록 재조회). 체크박스를 하나 이상 선택하면 **선택 삭제** 버튼이
따로 나타나 그 인원들만 바로 지울 수도 있다.

### 2.2 직무 등급 (9종)

| 직무 | 책임급 | 점장·부점장 | 1층 소속 | 2층 소속 | 1층 리드 | 2층 리드 |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| 점장 | ● | ● | (유동) | (유동) | (유동) | (유동) |
| 1층 부점장 | ● | ● | ● | | ● | |
| 2층 부점장 | ● | ● | | ● | | ● |
| 1층 매니저 | ● | | ● | | ● | |
| 2층 매니저 | ● | | | ● | | ● |
| 1층 대리 | | | ● | | ● | |
| 2층 대리 | | | | ● | | ● |
| 1층 사원 | | | ● | | | |
| 2층 사원 | | | | ● | | |

**점장은 층이 고정이 아니라 유동** — 알고리즘이 부족한 한 층(1층 또는 2층)에 배치해준다(§3.3 `floorCoverageOk`).

### 2.3 버튼

| 버튼 | 동작 |
|---|---|
| **휴무 생성** | 보고 있는 달 기준으로 스케줄 생성(60회 시도 중 최선안). 화면에만 표시(미저장). 확정본이 이미 있으면 경고. |
| **확정** | 화면의 수정본(생성 결과 또는 확정본을 달력에서 고친 것)을 `POST /schedule/confirm` 으로 저장(그 달 기존 확정본 덮어쓰기). 수정본이 없으면 비활성. |
| **수정 취소** | 수정본이 있을 때만 표시. 수정본을 버리고 서버 확정본 표시로 돌아감. |
| **⚙ 설정** | §2.1 의 입력 표들을 모달로 띄움. 모달 안 **전체 초기화** 버튼(빨강)이 `POST /schedule/reset` 수행 — `monthly_leaves` 전체 삭제·재생성 + 모든 직원의 원하는 휴일/연차 신청/필수 근무일 비움(이름·직무 유지). |

### 2.4 달력 (`MyCalendar.tsx` / `App.tsx`)

- 표시 대상: 이번 달 수정본이 있으면(`isPreview` = 방금 생성했거나 확정본을 달력에서 고친 뒤 확정 전) 그 수정본, 아니면 서버 확정 저장본.
  수정본은 한 달치만 메모리에 보관(`generatedLeaves`/`generatedMonth`) — 다른 달을 새로 생성·수정하면 확인 후 버려진다.
- 이벤트 제목: 일반 휴무 `이름 (n일)` / 대체휴무 `이름 (n일) 대체`(`n` 에 포함) / 연차 `이름 연차(n)`(`n` = 그 해 누적 사용 연차: 이전 달까지 확정분 `GET /annual-leave/usage?month=이전달` + 이번 달 날짜순 누계, 1월은 0부터. 휴무 누계 `(n일)` 에는 미포함). 색상은 기본 전원 흰색, **연차는 옅은 주황(`#ffe0b2`)**, **설정의 '원하는 휴일'로 받은 요청 휴무는 옅은 빨강(`#ffcdd2`, `leaveList` 의 이름+날짜와 일치하는 휴무)** 이며, 이벤트 클릭으로 선택한 인원만 강조색(파랑, 연차보다 우선)으로 표시(다시 클릭하면 선택 해제).
- 주말·공휴일 표시: 일요일 빨강·토요일 파랑 숫자, 공휴일은 배경색+이름 표시(`koreanHolidays.ts`, 2025~2027 정적 맵 — **연말에 다음 해 갱신 필요**). 알고리즘도 같은 맵을 읽는다(§3.2).
- **인원 선택(강조)**: 확정본·미리보기 어느 상태에서든 이벤트 클릭 시 그 인원을 선택해 강조색으로 표시(다시 클릭하면 해제). `selectedEmployee` 상태, 달 이동해도 유지.
- **미리보기 상태 또는 확정본이 있는 달(`canEdit`)** 에서 달력에서 직접 수정 가능, 경고 없이 바로 반영(위 인원 선택과 별개로 동시에 일어남).
  확정본에서 처음 수정하는 순간 그 달 확정본을 복사해 수정본을 만들고(`updateDraft`), **확정**을 눌러야 서버에 덮어쓴다(그 전엔 DB 변화 없음).
  미리보기 중엔 달력 아래 안내 문구와 **수정 취소** 버튼(수정본 버리고 확정본으로 복귀)이 나타난다:
  - **드래그**: 휴무 이벤트를 다른 날짜로 이동. 보이는 달 밖이거나 그 날 이미 휴무면 되돌림.
  - **삭제**: 이벤트 클릭(인원 선택과 동시에 발생) → `×` 아이콘 토글 표시 → 클릭하면 삭제. 다시 이벤트를 클릭하면 아이콘만 숨김.
  - **추가**: 빈 날짜 클릭 → 그 날짜의 기존 휴무 목록 바로 아래에 직원 select + `+` 버튼 위젯 토글 → 인원 선택 후 `+` 로 일반 휴무 추가.
  - 연차는 위 조작 대상이 아니다(연차는 표에서 관리).
  - (구현 메모: FullCalendar 는 `click` 이 아니라 `mousedown`/`touchstart` 시점에 날짜 클릭을 판정하므로, 추가 위젯 내부 클릭은 `onMouseDown`/`onTouchStart` 에서 전파를 막아야 위젯이 안 닫힌다.)
  - (구현 메모: FullCalendar 의 `dayCellContent` 는 날짜 셀 상단(날짜 숫자) 영역에만 꽂혀서 휴무 목록 아래에 놓을 수 없다. 그래서 `dayCellDidMount`/`dayCellWillUnmount` 로 각 셀의 `.fc-daygrid-day-frame`(휴무 목록 `.fc-daygrid-day-events` 바로 다음)에 포털용 DOM 노드를 직접 붙여두고, 거기에 `createPortal` 로 위젯을 렌더한다 — 일반 문서 흐름이라 셀 왼쪽부터 차지하고 목록 아래에 자연스럽게 이어진다.)

### 2.5 "누적 사용 연차" 열

`GET /annual-leave/usage?month=YYYY-MM` 결과. **그 해 1월부터 현재 보는 달까지** 확정된 `leave_type='annual'` 행 수(연도가 바뀌면 0부터).

---

## 3. 스케줄 생성 알고리즘 (`generateLeaveSchedule`)

### 3.1 성격

**그리디 + 랜덤 + Best-of-60.** 매번 `window.crypto` 난수를 쓰므로 Generate 할 때마다 결과가 다르다.
한 번의 시도(`runAttempt`, 백트래킹 없음)를 60회 반복해 `scoreAttempt()` 점수가 가장 낮은 결과를 채택한다.

**절대적으로 지키는 조건은 "인원별 의무 휴무일수"(직원 표의 휴무 일수 + 대체휴무)뿐.** 근무 인원·층·책임급 등은 최대한만 맞추고, 못 맞추면
`scoreAttempt` 벌점으로 처리 — 60개 중 가장 나은 것을 낸다.

### 3.2 파라미터

`scheduleEssentialWork = [(미사용), weekdayWorkers, minSeniors, minFirstFloor, minSecondFloor]`

| 이름 | 의미 |
|---|---|
| `baseQuotaOf(name)` (기본 8) | 인원별 의무 휴무일(연차 제외) = 직원 표 `휴무 일수`(`leave_days`). 대체휴무만큼 개인별 상향. `scheduleEssentialWork[0]` 은 더 이상 쓰지 않는다 |
| `weekdayWorkers` / `weekendWorkers`(=평일+1) | 평일/주말 **목표** 근무 인원 → `workTargetOf(day)` |
| `minSeniors`, `minFirstFloor`, `minSecondFloor` | 하루 최소 책임급 / 1층 / 2층 인원 |
| `minWorkGap`(3) / `maxWorkGap`(5) | 목표 연속 근무 3일 / **절대 한계 4일**(4일 도달 시 다음날 강제 휴무) |
| `directorFullQuota` | `false`(기본): 점장은 사전 확정 휴무일에만 쉼 / `true`: 다른 직원과 동일하게 배정 대상 |
| `offday` / `alteroffday` | 한국 공휴일 자동 반영만 사용(수동 입력 없음): `"설날"`/`"추석"` 당일 → `offday`, 그 외 공휴일 → `alteroffday` |
| `mandatoryWorkSet` | 직원별 필수 근무일 — 해당 날짜엔 휴무 배정 금지 |

### 3.3 조건 검사 `checkConditionToLeave(date, workforce, member, strict)`

그 사람을 쉬게 했을 때 남는 인원(`temp`)이 조건을 만족하는지 검사. 직무별 분기 없이 결과 인원 기준으로 판정.

- `strict=false`(채우기·막판·강제휴무) 또는 연속 근무 4일 초과자 → `temp.length ≥ workTargetOf(day) − 1` 만 확인.
- `strict=true`(일반 배정) → 위에 더해 `floorCoverageOk(temp)`(층별 최소 인원+리드, 점장이 부족한 층 커버 가능), 책임급·점장/부점장 최소 인원, 보조직무 조 잔존, `temp.length ≥ workTargetOf(day)`.
- 점장은 `directorFullQuota=false` 일 때만 모든 배정 단계·점수 계산에서 제외된다(`directorExempt`).

### 3.4 진행 단계 (`runAttempt`)

| 단계 | 내용 |
|---|---|
| 사전 확정 휴무 | 신청 휴무(의무 카운트 포함, 필수 근무일과 겹치면 무시) + 연차(카운트 제외) 반영 |
| 평균 수준 계산 | (시도 밖, 1회) 총 휴무 공급(사전 휴무 + 인원별 남은 의무 휴무 + 평일 공휴일 크레딧)을 날짜에 고르게 부었을 때의 수준 `fairLevel` — `Σ max(사전휴무_d, ℓ) = 공급` 을 이분 탐색 |
| 날짜 루프 | 연속 4일 도달자 강제 휴무(의무일수·간격 무관) → **`min(목표, floor(fairLevel))` 까지만** 배정(오래 못 쉰 사람 우선, 목표 간격→최소 간격 순). 예전엔 목표까지 1일부터 꽉 채워 앞쪽·사전휴무 많은 날에 몰리고 뒤쪽이 비었다 |
| 부족일 보충 | 휴무 인원이 적은 날부터(레벨 0→1→…) 목표까지 한 명씩 채움 = 물 채우기. 휴무 적은 사람·기존 휴무와 먼 날 위주 |
| 대체 휴무 | 공휴일(`alteroffday`)이 **평일(월~금)이면 근무 여부와 무관하게 전 인원**, **주말이면 그 날 실제 근무한 인원만** 개인 목표를 `휴무 일수 + credit` 로 상향 |
| 미달 인원 배치 | 목표 미달자를 **"그 날 휴무자 적은 날" 우선**, 같으면 기존 휴무와 먼 날에 배치(최소 간격 → 안 되면 간격 완화) |
| 연속 근무 차단 | 각 인원의 휴무 간격(월초/월말 포함)이 5일 이상이면 그 구간 안에 휴무 삽입(의무 휴무가 남은 경우만). 후보일은 양쪽이 4일 이하로 나뉘는 날 → 휴무자 적은 날 → 중앙에 가까운 날 순 |
| 연속 근무 이동 해소 | 그래도 5일 이상 연속 근무가 남은 인원(신청 휴일이 몰려 의무 휴무를 다 쓴 경우 등)은 자기 알고리즘 휴무 하나를 긴 구간 안으로 **이동**(총 휴무일수 그대로). 4일 초과분 총합이 줄 때만, 도착일은 휴무자 적은 날 우선, 완화 조건 검사. 사전 휴무·공휴일·필수 근무일은 제외 |
| 하루 인원 재분배 | 모든 배정이 끝난 뒤, **평일은 평일끼리·주말은 주말끼리**(의도된 평일/주말 차이는 유지) 하루 휴무 인원의 최대−최소 차가 2명 이상이면 많이 쉬는 날 → 적게 쉬는 날로 한 명씩 "이동"(개인별 총 휴무일수는 그대로 → 의무 휴무 조건 유지, 사전 확정 휴무는 이동 대상 제외, 이동 후 `strict` 조건·최소 근무 간격 재검사, **빠진 자리에 4일 초과 연속 근무가 새로 생기면 이동 안 함**) |

> **하루 목표(`leaveTargetOf`)를 모든 날에 동시에 만족시키는 건 수학적으로 불가능할 수 있다.** 예: 비점장
> 8명·의무 휴무 8일이면 총 휴무 공급은 64명일분인데, 평일 목표 3명×약 22일 + 주말 목표 2명×약 8일 ≈ 82명일분이
> 필요하면 하루도 빠짐없이 채울 수 없다(목표 미달은 정상적인 결과). "하루 인원 재분배" 단계는 이 구조적 한계
> 안에서 **평일/주말 그룹 내 쏠림만** 최대한 줄여줄 뿐, 모든 날이 목표를 채운다고 보장하지 않는다.

### 3.5 품질 점수 `scoreAttempt` (낮을수록 좋음, 대략적인 가중치)

의무 휴무(+대체) 미달(`×1000`)/초과(`×400`) · 근무 인원 미달(`×120`/목표−1 미만 `×600`) · 책임급·점장부점장 부재(`×500`/`400`) ·
`floorCoverageOk` 위반(`500`) · 보조직무 조 전원 휴무(`150`) · 일자별 휴무 인원 분산(`×45`) ·
**알고리즘 몰림(`×150`)**: 평일끼리·주말끼리 각 날의 휴무 인원이 `max(그 날 사전 휴무 수, 그룹 최소 + 1)` 을 넘는 초과 인원 합 — 사전 휴무만으로 많은 날은 봐준다 ·
**연속 근무 5일 이상(`×300`, 심각)** / 4일(`25`, 경미) · 휴무 몰림·간격 분산(`×40`/`×12`).

---

## 4. 서버 API (`/apis/agentinfo`)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/infos` | 직원 전체 목록 |
| GET | `/count` | 직원 수 |
| POST | `/infos` | 직원 생성 |
| PATCH / DELETE | `/infos/:id` | 직원 수정 / 삭제 |
| **GET** | **`/schedule?month=YYYY-MM`** | 그 달의 확정 휴일/연차. `{ leaves: [{ agentId, name, jobLevel, date, type }] }`, `type` ∈ `leave`/`annual`/`comp` |
| **POST** | **`/schedule/confirm`** | body `{ scheduleMonth, entries: [{ agentId, leaveDates[], compLeaveDates[], annualLeaveDates[] }] }`. 인원별 해당 월 통째 교체 저장(우선순위 `annual`>`comp`>`leave`) |
| **GET** | **`/annual-leave/usage?month=YYYY-MM`** | 그 해 1월~그 달까지 연차 누계 |
| **GET / PUT** | **`/settings`** | 앱 전역 설정 조회/저장(키별 JSON 문자열) |
| **POST** | **`/schedule/reset`** | `monthly_leaves` 재생성 + 직원 `description`/`annualleave`/`mandatory_workday` 비움. `app_settings` 는 유지 |

계층: `agentinfo.ctrl.ts` → `service/agentinfo.ts` → `model/agentinfoRepository.ts`. 오류는 `service/error.ts` 의
`BadRequestError(400)/NotFoundError(404)/ServerError(500)` → `apis/module/error.ts` 에서 JSON 변환.

**서버 기동 시 마이그레이션**(`main.ts` → `ensureAgentSchema()`): `agent_informations.mandatory_workday` 컬럼,
`agent_informations.leave_days`(INT, 기본 8 — 기존 직원은 8 로 채워짐) 컬럼,
`monthly_leaves.leave_type` 의 `'comp'` ENUM 값이 없으면 추가(`information_schema` 확인 후 `ALTER`, MySQL 5.7 대응).

---

## 5. DB 테이블

### 5.1 `agent_informations` — 직원 마스터

`agent_information_id`(PK) · `created_at`(서버 정렬 기준, 클라이언트는 직급순 재정렬) · `name` · `job_level` ·
`description`(원하는 휴일) · `annualleave`(연차 신청) · `mandatory_workday`(필수 근무일) — 이 3개는 전부 동일한
`"YYYY-MM-DD, ..."` 콤마 문자열 형식 · `leave_days`(INT, 기본 8, 월 휴무 일수). "전체 초기화" 는 날짜 3개만 비우고
`name`/`job_level`/`leave_days` 는 유지.

### 5.2 `app_settings` — 앱 전역 설정 (키-값)

`setting_key`(PK, `subjob1`/`subjob2`/`essentialWork`/`directorFullQuota` 등) / `setting_value`(TEXT, JSON 문자열).
"전체 초기화" 버튼은 이 테이블을 건드리지 않는다.

### 5.3 `monthly_leaves` — 확정된 휴일/연차 이력 (하루 = 한 행)

`monthly_leave_id`(PK) · `agent_information_id` · `schedule_month`(`'YYYY-MM'`, 조회용) · `leave_date`(DATE) ·
`leave_type`(ENUM `leave`/`annual`/`comp`) · `confirmed_at`. UNIQUE `(agent_information_id, leave_date)`.

- **확정 저장**(`replaceAgentMonthLeaves`): `entry.leaveDates`∪`compLeaveDates`∪`annualLeaveDates` 를 유형별로 합친 뒤,
  그 (직원, 달) 의 기존 행을 `DELETE` 하고 통째로 `INSERT` (트랜잭션). 다른 달·다른 직원 데이터는 그대로 남는다.
- **조회**(`getMonthlyLeaves`): `schedule_month` 로 필터, `agent_informations` 조인 — 직무는 **조회 시점 현재값**(과거 스냅샷 아님).
- **연차 누계**(`getAnnualLeaveUsageUpToMonth`): `leave_type='annual' AND schedule_month BETWEEN 'YYYY-01' AND 'YYYY-MM'` COUNT.
- 이전 버전 `monthly_schedules`(직원×월 한 행 + 콤마 문자열) 는 폐기, reset 시 함께 DROP.

---

## 6. 알려진 제약 / 주의점

- **이름 기준 매칭**: 신청 휴일/연차/필수근무일/confirm entries 가 모두 직원 *이름* 으로 매칭된다. 동명이인이 있으면 꼬인다.
- **인원 부족 시 한계**: 백트래킹이 없어 조건이 빡빡하면(예: 7인 매장에서 주말 목표 7명 = 주말 휴무 0) 일부 인원이 의무
  휴무·대체휴무를 다 못 받을 수 있다 — 그래도 60개 중 최선을 낸다.
- 확정본 수정은 화면 수정본 → **확정**(같은 `POST /schedule/confirm`, 그 달 통째 교체)으로 저장한다. 확정 전에 새로고침하면 수정 내용은 사라진다.
- `create_table.sql` 은 DB 볼륨 최초 생성 시에만 실행 — 기존 DB 는 `ensureAgentSchema()` + "전체 초기화" 버튼으로 스키마를 맞춘다.

---

## 7. UI 변경 이력

### 2026-10-21 — 작은 화면(모바일) 대응

- **설정 창 직원 표 가로 잘림 수정** (`ReactTable.tsx`, `styles.css`): `.emp-grid` 가 부모(모달) 너비로 고정돼
  넘치는 칸이 `overflow:hidden` 에 잘렸다 → `width: max-content` 로 내용 폭만큼 넓히고, 넘치는 부분은 설정 창
  (`.settings-modal-content`) 의 가로 스크롤 하나로 본다. (표 전용 스크롤 래퍼를 따로 두면 모달 스크롤과 겹쳐
  창을 줄였을 때 오른쪽이 잘려 보여서 제거.)
- **설정 창 최소 너비** (`App.css`): `min-width: 480px` → `min(480px, 95vw)` — 폰에서 창이 화면 밖으로 나가지 않게.
- **설정 표 DatePicker 초기 달** (`ReactTable.tsx`): 원하는 휴일/연차 신청/필수 근무일 DatePicker 3개에
  `currentDate={new DateObject(`${currentMonth}-01`)}` 지정 — 선택된 날짜가 없어도 메인 달력과 같은 달로 열린다.
- **메인 달력 최소 너비 + 가로 스크롤** (`MyCalendar.tsx`, `MyCalendar.css`): `.optimized_calendar` 에
  `min-width: 760px`(최대 1100px 은 유지)를 주고 `.calendar-scroll`(`overflow-x:auto`) 로 감쌌다. 화면이 더 좁으면
  달력이 찌그러지지 않고 달력 영역만 좌우 드래그/스크롤된다. (중간에 시도한 모바일 전용 `height="auto"` + 칸
  `min-height` 방식은 이것으로 대체되어 제거.)
- **월 이동 버튼 위치** (`MyCalendar.tsx`, `MyCalendar.css`): `headerToolbar` 를 `center: 'prev title next'` 로 바꿔
  `[<] 월 텍스트 [>]` 배치. 가운데 툴바 묶음을 flex(`gap: 16px`, 세로 중앙 정렬)로 맞춤.

### 2026-10-22 — 인원별 휴무 일수

- 전원 8일 고정이던 의무 휴무일수를 **인원별로** 정할 수 있게 함. 설정 창 직원 표의 직무 등급 오른쪽에 `휴무 일수`
  열(숫자 입력, 기본 8) 추가 → `agent_informations.leave_days` 저장 → `generateLeaveSchedule` 이 인원별 쿼터
  (`baseQuotaOf`)로 사용(대체휴무 크레딧은 그 위에 더함, 대체/일반 휴무 구분도 인원별 기준).
- 필수 조건 표의 `1인당 휴일` 칸은 위 열로 대체되어 제거(`essentialWork[0]` 은 배열 순서 유지용으로만 남음).
- 메인 달력에서 연차 이벤트(`이름 연차`)를 옅은 주황 배경(`ANNUAL_EVENT_COLOR`)으로 표시.

### 2026-10-26 — 확정본 달력 수정

- 확정된 달도 메인 달력에서 드래그·추가·삭제 가능. 첫 수정 시 확정본을 수정본으로 복사, **확정**을 다시 눌러야 DB에 덮어쓰기.
- 미리보기 중 안내 문구 + **수정 취소** 버튼 추가. `isPreview` 는 수정본 길이와 무관하게 `generatedMonth === currentMonth` 로 판정
  (전부 삭제한 수정본도 확정 가능).

### 2026-10-26 — 휴무 몰림 완화 / 5일 연속 근무 감소

- §3.4 의 평균 수준(`fairLevel`) 계산·날짜 루프 상한, 미달 인원 배치 정렬(휴무자 적은 날 우선), 연속 근무 차단 후보 정렬,
  **연속 근무 이동 해소** 단계 신설, 재분배 시 연속 근무 가드, §3.5 알고리즘 몰림 벌점 추가.
- 실제 DB 데이터(직원 9명, 평일 근무 6명)로 각 40회 생성해 비교:

  | 달 | 평일 최대−최소 평균 | 알고리즘 몰림(초과 인원 합) | 5일 이상 연속 근무 발생 |
  |---|---|---|---|
  | 2026-10 (사전 휴무 많음, 공휴일 3일) | 1.97 → 1.5 | 9.2 → 약 5 | 약 10% → 약 3% |
  | 2026-11 (사전 휴무 거의 없음) | 1.10 → 1.07 | 0.53 → 0.07 | 약 40% → 0% |
  | 2026-12 | 1.13 → 1.00 | 0.93 → 0.00 | 0% → 0% |

  10월에 남는 차이는 월말(26~29일)에 사전 휴무가 몰려 30일로 옮길 수 있는 인원이 최소 근무 간격에 막히는 구조적 한계.

### 2026-10-26 — 요청 휴무 색 구분

- 메인 달력에서 설정의 '원하는 휴일'과 같은 (이름, 날짜) 휴무를 옅은 빨강(`REQUESTED_EVENT_COLOR`)으로 표시. 확정본·미리보기 모두 적용, 선택 강조색이 우선.

### 2026-10-26 — 달력 연차 누적 표시

- 메인 달력 연차 이벤트를 `이름 연차(n)` 로 표시. `n` 은 그 해 누적 사용 연차(이전 달까지 확정분 + 이번 달 날짜순). `annualUsageBeforeMonth`(useAgentinfo) 가 달력 달 변경 시 조회.

### 2026-10-26 — 1층 부점장

- 직무 등급에 `1층 부점장` 추가(책임급·점장/부점장·1층 소속·1층 리드).
- 미리보기 안내 문구를 수정본 출처(`generatedMethod`)로 구분: 생성 결과면 "생성된 휴무 미리보기", 확정본을 고친 거면 "확정본을 수정 중"
  (예전엔 확정본이 있는 달에서 새로 생성해도 "확정본을 수정 중" 으로 나왔다).
