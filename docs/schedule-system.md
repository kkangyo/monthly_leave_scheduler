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
[ReactTable 입력]                 [App.tsx]                        [server /apis/agentinfo]        [MySQL]
 직원(이름/직무, 직급순 정렬) ──►  agentList ──────────────────────► GET  /infos ───────────────►  agent_informations
 원하는 휴일/연차/필수근무일      leaveList/annualLeaveList/         POST /infos
                                  mandatoryWorkList                 PATCH/DELETE /infos/:id
 매장 필수 조건 5개 + 점장 휴무   scheduleEssentialWork /
 방식, 전체·대체 휴일, 보조직무   directorFullQuota
                                  + koreanHolidays.ts (자동 반영)

[달력에서 달 이동] ──► currentMonth 변경
        │
        ├─► GET /schedule?month=YYYY-MM      ─► monthly_leaves (해당 월 확정본)  ─► 달력 표시
        └─► GET /annual-leave/usage?month=… ─► monthly_leaves (1월~해당월 연차)  ─► 표의 "누적 사용 연차"

[Generate] ─► generateLeaveSchedule() ─► 화면에만 제안 표시 (미저장, 달력에서 드래그·추가·삭제로 수정 가능)
[확정]     ─► POST /schedule/confirm  ─► monthly_leaves 에 인원별 해당 월 통째 교체 저장
[초기화]   ─► POST /schedule/reset    ─► monthly_leaves DROP&CREATE + 직원 입력값 비움
```

생성 결과는 확정을 눌러야 서버에 저장되고, 달을 바꾸면 그 달의 확정 저장본이 자동으로 달력에 그려진다.

---

## 2. 화면 기능

### 2.1 입력 표 (`ReactTable.tsx`)

| 표 | 항목 | 저장 위치 |
|---|---|---|
| 직원 표 | 이름, 직무 등급, 원하는 휴일, 연차 신청, 필수 근무일, **누적 사용 연차(읽기전용)** | `agent_informations` (앞 5개, `"YYYY-MM-DD, ..."` 콤마 문자열) / `monthly_leaves` 집계(마지막). **직급순 정렬**(점장>부점장>매니저>대리>사원, 같은 직급이면 1층<2층) |
| 필수 조건 | `1인당 휴일`, `평일 근무 인원(주말+1)`, `최소 책임급 수`, `필수 1층 인원`, `필수 2층 인원` | `app_settings.essentialWork` (JSON 배열). 기본값 `[8,6,1,3,2]` |
| 점장 휴무 방식 | "사전 확정 휴무일에만 쉼" / "직원과 동일하게 의무 휴무 적용" | `app_settings.directorFullQuota` (boolean, 기본 `false`) |
| 휴일 | 전체 휴일, 대체 휴일 | 클라이언트 상태(매번 입력, 저장 안 됨). 한국 공휴일은 자동 반영되므로 따로 넣을 필요 없음 |
| 보조직무 | 온라인 업무 2명, RT 업무 2명 | `app_settings.subjob1`/`subjob2` |

`app_settings` 항목은 변경 시 800ms 디바운스 후 `PUT /settings` 로 자동 저장, 앱 시작 시 `GET /settings` 로 로드. 표에서 행 저장 시 `POST/PATCH /infos` → 재조회.

### 2.2 직무 등급 (8종)

| 직무 | 책임급 | 점장·부점장 | 1층 소속 | 2층 소속 | 1층 리드 | 2층 리드 |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| 점장 | ● | ● | (유동) | (유동) | (유동) | (유동) |
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
| **Generate** | 보고 있는 달 기준으로 스케줄 생성(60회 시도 중 최선안). 화면에만 표시(미저장). 확정본이 이미 있으면 경고. |
| **확정** | 화면의 제안(달력 수동 수정 포함)을 `POST /schedule/confirm` 으로 저장. |
| **스케줄·휴일 입력 초기화** (빨강) | `POST /schedule/reset` — `monthly_leaves` 전체 삭제·재생성 + 모든 직원의 원하는 휴일/연차 신청/필수 근무일 비움(이름·직무 유지). |

### 2.4 달력 (`MyCalendar.tsx` / `App.tsx`)

- 표시 대상: 이번 달을 방금 생성했으면(`isPreview`) 그 제안, 아니면 서버 확정 저장본.
- 이벤트 제목: 일반 휴무 `이름 (n일)` / 대체휴무 `이름 (n일) 대체`(`n` 에 포함) / 연차 `이름 연차`(숫자 없음, 누계 제외). 색상은 기본 전원 흰색이며, 이벤트 클릭으로 선택한 인원만 강조색(파랑)으로 표시(다시 클릭하면 선택 해제).
- 주말·공휴일 표시: 일요일 빨강·토요일 파랑 숫자, 공휴일은 배경색+이름 표시(`koreanHolidays.ts`, 2025~2027 정적 맵 — **연말에 다음 해 갱신 필요**). 알고리즘도 같은 맵을 읽는다(§3.2).
- **인원 선택(강조)**: 확정본·미리보기 어느 상태에서든 이벤트 클릭 시 그 인원을 선택해 강조색으로 표시(다시 클릭하면 해제). `selectedEmployee` 상태, 달 이동해도 유지.
- **미리보기 상태(`isPreview`, 확정 전)에서만** 달력에서 직접 수정 가능, 경고 없이 바로 반영(위 인원 선택과 별개로 동시에 일어남):
  - **드래그**: 휴무 이벤트를 다른 날짜로 이동. 보이는 달 밖이거나 그 날 이미 휴무면 되돌림.
  - **삭제**: 이벤트 클릭(인원 선택과 동시에 발생) → `×` 아이콘 토글 표시 → 클릭하면 삭제. 다시 이벤트를 클릭하면 아이콘만 숨김.
  - **추가**: 빈 날짜 클릭 → 그 셀에 직원 select + `+` 버튼 위젯 토글 → 인원 선택 후 `+` 로 일반 휴무 추가.
  - 연차와 확정 저장본은 위 조작 대상이 아니다(연차는 표에서, 확정본 수정은 별도 API 미구현).
  - (구현 메모: FullCalendar 는 `click` 이 아니라 `mousedown`/`touchstart` 시점에 날짜 클릭을 판정하므로, 추가 위젯 내부 클릭은 `onMouseDown`/`onTouchStart` 에서 전파를 막아야 위젯이 안 닫힌다.)

### 2.5 "누적 사용 연차" 열

`GET /annual-leave/usage?month=YYYY-MM` 결과. **그 해 1월부터 현재 보는 달까지** 확정된 `leave_type='annual'` 행 수(연도가 바뀌면 0부터).

---

## 3. 스케줄 생성 알고리즘 (`generateLeaveSchedule`)

### 3.1 성격

**그리디 + 랜덤 + Best-of-60.** 매번 `window.crypto` 난수를 쓰므로 Generate 할 때마다 결과가 다르다.
한 번의 시도(`runAttempt`, 백트래킹 없음)를 60회 반복해 `scoreAttempt()` 점수가 가장 낮은 결과를 채택한다.

**절대적으로 지키는 조건은 "인원별 의무 휴무일수"뿐.** 근무 인원·층·책임급 등은 최대한만 맞추고, 못 맞추면
`scoreAttempt` 벌점으로 처리 — 60개 중 가장 나은 것을 낸다.

### 3.2 파라미터

`scheduleEssentialWork = [maxLeavesPerEmployee, weekdayWorkers, minSeniors, minFirstFloor, minSecondFloor]`

| 이름 | 의미 |
|---|---|
| `maxLeavesPerEmployee` (기본 8) | 1인당 의무 휴무일(연차 제외). 대체휴무만큼 개인별 상향 |
| `weekdayWorkers` / `weekendWorkers`(=평일+1) | 평일/주말 **목표** 근무 인원 → `workTargetOf(day)` |
| `minSeniors`, `minFirstFloor`, `minSecondFloor` | 하루 최소 책임급 / 1층 / 2층 인원 |
| `minWorkGap`(3) / `maxWorkGap`(5) | 목표 연속 근무 3일 / **절대 한계 4일**(4일 도달 시 다음날 강제 휴무) |
| `directorFullQuota` | `false`(기본): 점장은 사전 확정 휴무일에만 쉼 / `true`: 다른 직원과 동일하게 배정 대상 |
| `offday` / `alteroffday` | 표 입력 + 한국 공휴일 자동(`"설날"`/`"추석"` 당일 → `offday`, 그 외 공휴일 → `alteroffday`) |
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
| 날짜 루프 | 연속 4일 도달자 강제 휴무(의무일수·간격 무관) → 목표 인원까지 배정(오래 못 쉰 사람 우선, 목표 간격→최소 간격 순) |
| 부족일 보충 | 목표에 못 미친 날을 휴무 적은 사람·기존 휴무와 먼 날 위주로 채움 |
| 대체 휴무 | 공휴일(`alteroffday`)이 **평일(월~금)이면 근무 여부와 무관하게 전 인원**, **주말이면 그 날 실제 근무한 인원만** 개인 목표를 `8 + credit` 로 상향 |
| 미달 인원 배치 | 목표 미달자를 "기존 휴무와 멀고 그 날 휴무자 적은 날" 위주로 배치(최소 간격 → 안 되면 간격 완화) |
| 연속 근무 차단 | 각 인원의 휴무 간격(월초/월말 포함)이 5일 이상이면 그 구간 중앙에 휴무 삽입 |

### 3.5 품질 점수 `scoreAttempt` (낮을수록 좋음, 대략적인 가중치)

의무 휴무(+대체) 미달(`×1000`)/초과(`×400`) · 근무 인원 미달(`×120`/목표−1 미만 `×600`) · 책임급·점장부점장 부재(`×500`/`400`) ·
`floorCoverageOk` 위반(`500`) · 보조직무 조 전원 휴무(`150`) · 일자별 휴무 인원 분산(`×45`) ·
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
`monthly_leaves.leave_type` 의 `'comp'` ENUM 값이 없으면 추가(`information_schema` 확인 후 `ALTER`, MySQL 5.7 대응).

---

## 5. DB 테이블

### 5.1 `agent_informations` — 직원 마스터

`agent_information_id`(PK) · `created_at`(서버 정렬 기준, 클라이언트는 직급순 재정렬) · `name` · `job_level` ·
`description`(원하는 휴일) · `annualleave`(연차 신청) · `mandatory_workday`(필수 근무일) — 마지막 3개는 전부 동일한
`"YYYY-MM-DD, ..."` 콤마 문자열 형식. "초기화" 는 이 3개만 비우고 `name`/`job_level` 은 유지.

### 5.2 `app_settings` — 앱 전역 설정 (키-값)

`setting_key`(PK, `subjob1`/`subjob2`/`essentialWork`/`directorFullQuota` 등) / `setting_value`(TEXT, JSON 문자열).
"초기화" 버튼은 이 테이블을 건드리지 않는다.

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
- **달력 수동 편집은 미리보기(확정 전)에서만** 가능. 확정 저장본을 고치려면 다시 Generate 하거나 별도 API(미구현)가 필요.
- `create_table.sql` 은 DB 볼륨 최초 생성 시에만 실행 — 기존 DB 는 `ensureAgentSchema()` + "초기화" 버튼으로 스키마를 맞춘다.
