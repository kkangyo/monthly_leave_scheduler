# 계정 관리 / 로그인 기능 설계 (구현 전 정리본)

`create_account` 브랜치에서 작업 중인 기능의 설계 문서. 구현이 어느 정도 진행되면
`master`로 머지한다. 완료되면 이 문서 내용은 `docs/schedule-system.md`에 반영하고 이
파일은 정리한다.

## Context

현재 시스템은 완전 단일 테넌트(매장 구분 없음)에 인증이 전혀 없다 — 모든 `/apis/agentinfo/*`
API가 누구나 호출 가능하고, `agent_informations`/`monthly_leaves`/`app_settings` 세 테이블
모두 매장 구분 컬럼이 없다. 이번에 추가할 기능은 직원들이 매장별 계정으로 로그인해서 자신의
사전휴무/연차/필수근무일을 직접 설정·확인하고(다른 사람 건 읽기전용), 관리자(점장/부점장)는
기존처럼 매장 전체 설정·직원 관리·휴무 생성/확정을 할 수 있게 하는 것. 여러 매장으로 점차
확장할 계획이라 처음부터 매장 단위로 데이터가 격리돼야 한다.

사용자가 확정한 결정:
1. **매장 관리자 판별**: `job_level`이 점장/2층 부점장이거나, **별도로 "휴무 관리" 권한을
   부여받은 직원**이면 관리자(두 조건 OR). job_level 외에 추가 플래그가 하나 필요함.
2. **일반 직원 계정은 (매장) 관리자가 직원 표에서 직접 생성** (ID/임시 비밀번호 입력)
3. **로그인 화면의 "매장"은 코드를 직접 입력** (공개 매장 목록 API 불필요)
4. **슈퍼관리자(개발자) 티어가 별도로 필요**: 매장 생성/삭제 등 플랫폼 레벨 작업과, 신규
   매장의 "최초 관리자 계정" 생성 후 고객에게 전달하는 역할. 슈퍼관리자는 모든 매장의 모든
   설정에 접근 가능해야 함.
5. **검증은 사용자가 직접 수행**: 구현 중에는 `tsc --noEmit`/`eslint` 같은 간단한 정적
   검증만 하고, 실제 로그인/권한 플로우 테스트는 전부 사용자가 맡아서 피드백을 준다 —
   완료 시 체크리스트만 전달.

## 현재 구조 (탐색 결과 요약)

- **서버**: Express + `mysql2`(raw query, ORM 없음) + `cors()`(인증 없음). 공식 마이그레이션
  도구 없이 `agentinfoRepository.ts`의 `ensureAgentSchema()`가 부팅 시
  `information_schema` 확인 후 필요하면 `ALTER TABLE`을 직접 실행하는 방식(예:
  `mandatory_workday` 컬럼, `comp` ENUM 값 추가 이력) — 이번 마이그레이션도 같은 패턴을 따른다.
- **`agentinfoRepository.ts`**: 모든 행 조회/수정은 이미 `agent_information_id`(UUID)로
  한다 — 이름 매칭 문제는 서버 레이어엔 없고 클라이언트 알고리즘(`App.tsx`)에만 있다(이번
  작업 범위 밖, 건드리지 않음).
- **라우트 전체 목록**(`agentinfo.ctrl.ts`): `POST/GET/PATCH/DELETE /infos`, `GET /count`,
  `GET /schedule`, `POST /schedule/confirm`, `POST /schedule/reset`, `GET /annual-leave/usage`,
  `GET/PUT /settings` — 전부 인증 없이 열려 있고 전역(매장 구분 없음) 동작.
- **클라이언트**: `useAgentinfo.tsx`가 전체 상태/API 콜을 쥐고 있고 "현재 로그인한 사용자"
  개념이 전혀 없음. `ReactTable.tsx`(619줄)는 직원 표의 편집 가능 여부를 **컬럼 단위**
  (`editableColumns` 배열)로만 제어 — "내 행만 수정 가능"은 **행 단위** 권한 체크로 바꿔야 함.
  저장은 `handleSaveAll`이 로컬 상태 전체를 서버 스냅샷과 diff해서 생성/수정/삭제를 모아
  한 번에 처리하는 구조.
- **의존성**: 서버/클라이언트 어디에도 `bcrypt`/`jsonwebtoken` 등 인증 라이브러리 없음 — 새로
  추가 필요. 서버는 `node:16.18.0`(풀 이미지, native 모듈 빌드 가능)이지만, Docker 빌드
  단순함을 위해 **native 의존성 없는 `bcryptjs`**를 쓴다.

## 설계

### 1. 인증 방식: JWT (stateless), 3단계 권한

세션 스토어(redis 등) 인프라가 전혀 없는 상태라, 새 인프라 추가 없이 가장 적은 변경으로
끝나는 stateless JWT를 쓴다. 권한은 3단계: **슈퍼관리자(개발자, 매장 무관)** →
**매장 관리자**(점장/부점장 또는 "휴무 관리" 권한 직원) → **일반 직원**(본인 것만 수정).

- 서버: `jsonwebtoken` + `bcryptjs` 추가. `.server.env`에 `JWT_SECRET` 추가.
- **매장 계정 토큰** payload: `{ accountId, storeId, agentId, loginId }` — admin 여부는
  토큰에 넣지 않고 **매 요청마다 DB에서 `job_level`/`is_schedule_manager`로 판별**(권한
  변경 시 재로그인 없이 즉시 반영).
- **슈퍼관리자 토큰** payload: `{ superadmin: true, loginId }` — 매장에 묶이지 않음.
  슈퍼관리자는 DB 테이블 없이 `.server.env`의 `SUPERADMIN_LOGIN_ID`/
  `SUPERADMIN_PASSWORD_HASH`로 비교(개발자 한 명만 쓰는 용도라 테이블까지는 과함 — 나중에
  여러 명이 필요해지면 그때 테이블로 승격).
- `requireAuth` 미들웨어: JWT 검증 후 `req.auth`에 둘 중 하나로 부착. 슈퍼관리자 요청은
  `storeId`를 요청(헤더/쿼리)에서 명시적으로 받아 사용하고, 매장 계정 요청은 토큰에 고정된
  `storeId`만 쓴다(클라이언트가 보낸 값 신뢰 안 함 — 매장 간 데이터 격리의 핵심).
- 클라이언트: 로그인 응답에 토큰 + 프로필(storeId, storeName, agentId, name, jobLevel,
  isAdmin)을 같이 내려줘서 클라이언트가 JWT를 직접 디코드할 필요 없게 한다. 토큰은
  `localStorage`에 저장, 모든 요청에 `Authorization: Bearer <token>` 헤더로 첨부.
- 슈퍼관리자 전용 UI는 이번 범위에 넣지 않는다(개발자 본인만 쓰므로 API 직접 호출로 충분,
  필요해지면 나중에 별도 화면 추가).

### 2. DB 스키마 (`server/.db/initdb.d/create_table.sql` + `ensureAgentSchema()` 패턴 확장)

```sql
CREATE TABLE IF NOT EXISTS `stores` (
  `store_id` CHAR(36) NOT NULL,
  `store_code` VARCHAR(50) NOT NULL,        -- 로그인 시 입력하는 코드
  `store_name` VARCHAR(100) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`store_id`),
  UNIQUE KEY `uq_store_code` (`store_code`)
);

CREATE TABLE IF NOT EXISTS `accounts` (
  `account_id` CHAR(36) NOT NULL,
  `store_id` CHAR(36) NOT NULL,
  `agent_information_id` CHAR(36) NOT NULL,  -- 1:1, 이 계정이 어느 직원 레코드인지
  `login_id` VARCHAR(50) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`account_id`),
  UNIQUE KEY `uq_store_login` (`store_id`, `login_id`),
  UNIQUE KEY `uq_agent_account` (`agent_information_id`)
);
```
+ 기존 3개 테이블에 `store_id CHAR(36) NOT NULL` 컬럼 추가(ALTER, `ensureAgentSchema()`에서
  `information_schema.COLUMNS` 확인 후 실행 — 기존 패턴 그대로). `app_settings`는 PK를
  `(store_id, setting_key)` 복합키로 변경. `agent_informations`에는 관리자 판별용
  `is_schedule_manager TINYINT(1) NOT NULL DEFAULT 0` 컬럼도 추가("휴무 관리" 권한 플래그 —
  직무와 무관하게 매장 관리자가 특정 직원에게 부여).

**부트스트랩(최초 1회, 기존 데이터 마이그레이션 — "새 매장 생성"과는 다른, 일회성 보존 작업)**:
`stores`/`accounts` 테이블이 이번에 처음 생기면서 기존 `agent_informations` 행에 아직
`store_id`가 없는 게 감지되면,
1. 지금 쓰고 있는 테스트 매장용 `stores` 행 1개만 자동 생성(`store_code`는 env
   `DEFAULT_STORE_CODE`, 없으면 `"default"`).
2. 기존 `agent_informations`/`monthly_leaves`/`app_settings`의 모든 행에 그 `store_id` 백필.
3. 계정은 **자동 생성하지 않는다.** 대신 개발자가 슈퍼관리자로 로그인해서, 이후 설명할
   계정 생성 API(신규 매장에도 똑같이 쓰는 바로 그 메커니즘)로 이 매장의 첫 관리자 계정을
   수동으로 만든다 — 특정 직원을 추측해서 임시 비밀번호를 자동 발급하는 특별 처리를 두지
   않고, "매장 최초 관리자 계정 생성"을 신규 매장과 동일한 한 가지 경로로 통일한다.

### 3. 서버 API 변경

- 신규 `server/app/src/apis/auth/` 모듈:
  - `POST /apis/auth/login` — body `{ storeCode, loginId, password }` → `stores` 조회 →
    `accounts` 조회(store_id+login_id) → `bcrypt.compare` → JWT 발급 + 프로필 반환.
  - `POST /apis/auth/superadmin-login` — body `{ loginId, password }` → env 값과 비교 →
    슈퍼관리자 JWT 발급.
  - `POST /apis/auth/accounts` (매장 관리자 또는 슈퍼관리자) — 특정 `agent_information_id`에
    로그인ID/임시 비밀번호 생성.
  - `PATCH /apis/auth/accounts/:id` (매장 관리자/슈퍼관리자, 또는 본인) — 비밀번호 재설정.
- 신규 `server/app/src/apis/superadmin/` 모듈 (슈퍼관리자 전용):
  - `POST /apis/superadmin/stores` — 매장 생성(storeCode, storeName).
  - `GET /apis/superadmin/stores` — 전체 매장 목록.
  - `DELETE /apis/superadmin/stores/:storeId` — 매장 삭제(파괴적 — 소속 데이터 전부 삭제,
    확인 절차 필요).
  - 직원/계정 생성은 새 엔드포인트를 따로 만들지 않고 기존 `/apis/agentinfo/infos`,
    `/apis/auth/accounts`를 그대로 재사용한다 — 슈퍼관리자 토큰이면 `requireAuth`가
    요청에 명시된 `storeId`(헤더 `X-Store-Id`)를 신뢰하도록만 분기(아래).
- 신규 `requireAuth` 미들웨어: JWT 검증 후,
  - 매장 계정 토큰 → `req.auth = { kind: 'store', accountId, storeId, agentId }`(storeId는
    토큰 고정값만 사용, 클라이언트가 보낸 값은 무시 — 매장 간 데이터 격리의 핵심).
  - 슈퍼관리자 토큰 → `req.auth = { kind: 'superadmin', storeId: req.header('X-Store-Id') }`
    (이 경우에만 요청이 지정한 storeId를 신뢰).
  `main.ts`에서 `/apis/agentinfo` 전체와 신규 account/superadmin 라우트에 적용(로그인
  라우트들만 예외).
- 라우트별 권한 분기 (매장 관리자 여부는 요청마다
  `job_level IN ('점장','2층 부점장') OR is_schedule_manager=1` 로 판별, 슈퍼관리자는 항상 통과):
  - 읽기 전용 라우트(`GET /infos`, `/schedule`, `/annual-leave/usage`, `/settings`, `/count`)
    → 인증만 되면 누구나(매장 내).
  - 매장 전체 변경 라우트(`POST/DELETE /infos`, `/schedule/confirm`, `/schedule/reset`,
    `PUT /settings`, 계정 생성, `is_schedule_manager` 플래그 변경) → 매장 관리자 또는
    슈퍼관리자만.
  - `PATCH /infos/:id` → 관리자는 전체 필드, 본인(`id === req.auth.agentId`)은
    `description`/`annualleave`/`mandatory_workday` 필드만 수정 가능하도록 서비스 레이어에서
    분기(이름/직무/관리자 플래그는 본인도 수정 불가).

### 4. 클라이언트 변경

- 신규 `AuthContext`(`client/app/src/hooks/useAuth.tsx`): `login()`/`logout()`,
  `localStorage`에 토큰+프로필 저장, `isAuthenticated`/`profile`(agentId, name, jobLevel,
  isAdmin, storeName) 노출.
- `instance.ts`: 모든 fetch에 `Authorization` 헤더 자동 첨부, 401 응답 시 전역 로그아웃 처리.
- 신규 `Login.tsx`: 매장코드/ID/비밀번호 폼. `App.tsx` 최상단에서 `!isAuthenticated`면 이
  화면만 렌더(라우터 불필요, 단순 조건 렌더).
- `App.tsx`: 로그아웃 버튼 추가, `profile.isAdmin`이 아니면 "휴무 생성"/"확정"/⚙ 설정 안의
  전체초기화 버튼 숨김(서버도 동일하게 막으므로 이건 UX용 방어).
- `ReactTable.tsx`: 직원 표 편집 가능 여부를 **행 단위**로 바꿈 — 관리자면 전부 편집 가능,
  아니면 `row.agent_information_id === profile.agentId`인 행만 원하는휴일/연차신청/
  필수근무일 편집 가능 + 그 외 행은 읽기 전용 텍스트로 렌더. 필수조건/보조직무 섹션은
  관리자에게만 렌더. 관리자 전용으로 각 직원 행에 로그인ID/비밀번호 설정 UI +
  "휴무 관리 권한" 체크박스 추가.

## 검증

구현 중에는 매 단계마다 `cd client/app && npx tsc --noEmit && npx eslint src` /
`cd server/app && npx tsc --noEmit` 로 정적 검증만 하고, 실제 동작 테스트는 전부 사용자가
진행한다. 완료 시 아래 체크리스트를 전달:

1. 슈퍼관리자 로그인(`/apis/auth/superadmin-login`) 성공
2. 기존 테스트 매장이 `stores`/`agent_informations.store_id` 등에 정상 백필됐는지 확인
3. 슈퍼관리자로 그 매장의 관리자 계정 생성 → 매장코드+ID+비밀번호로 로그인 성공
4. 관리자 계정으로 직원 표에서 일반 직원 계정 생성
5. 그 직원 계정으로 로그인 → 본인 행만 원하는휴일/연차신청/필수근무일 수정 가능, 타인 행은
   읽기 전용인지 확인
6. 그 직원 계정으로 관리자 전용 API(예: `POST /schedule/reset`, 직원 삭제) 직접 호출 시
   403으로 막히는지 확인
7. 슈퍼관리자로 매장을 하나 더 생성 → 새 매장 계정으로 로그인했을 때 기존 매장 데이터가
   전혀 안 보이는지(매장 간 격리) 확인
8. "휴무 관리" 플래그를 받은, job_level이 점장/부점장이 아닌 직원도 관리자 화면에
   접근되는지 확인
