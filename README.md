# shunii-schedule-website

매장 직원들의 **월 단위 휴무(휴일·연차) 스케줄**을 자동으로 생성하고, 확정된 스케줄을 이력으로
저장·조회하는 웹앱입니다.

- **client**: `client/app` (React + TypeScript, react-scripts, FullCalendar)
- **server**: `server/app` (Express + TypeScript, mysql2)
- **DB**: MySQL 5.7 (docker-compose)

동작 방식·알고리즘·API·DB 스키마에 대한 자세한 설명은 [`docs/schedule-system.md`](docs/schedule-system.md) 를 참고하세요.

---

## 준비물

- Docker & Docker Compose
- Node.js (client/server 각 `package.json` 참고), npm

## 설정

`config/.server.env`, `config/.client.env` 에서 포트·DB 접속 정보를 설정합니다. 기본값 그대로도 동작합니다.

## 실행

```bash
# 최초 1회: 의존성 설치 (root + client + server)
npm run bootstrap

# 서버 + 클라이언트 동시 실행 (서버: docker-compose, 클라이언트: pm2)
npm run start:all

# 서버만 실행 (MySQL + Node API, docker-compose)
npm run start:server

# 클라이언트만 실행 (pm2)
npm run start:client
```

실행 후 클라이언트는 `http://localhost:<CLIENT_PORT>` (기본 5005), 서버 API 는
`http://localhost:<PORT>` (기본 8000) 에서 접근할 수 있습니다.

## 종료

```bash
# 서버 컨테이너만 중지
npm run stop:server

# 서버 + 클라이언트(pm2) 모두 종료
npm run exit:all
```

## Windows

```bash
npm run start:windows
```

---

## 라이선스

[MIT](LICENSE)
