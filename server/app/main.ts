import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config({ path: '../../config/.server.env' });

const app = express();
const PORT = process.env.PORT || 8000;

import agentinfo from './src/apis/agentinfo';
import auth from './src/apis/auth';
import superadmin from './src/apis/superadmin';
import requireAuth from './src/apis/module/requireAuth';
import AgentinfoRepository from './src/model/agentinfoRepository';

app.use(cors());

app.listen(PORT, async () => {
  console.log(`server start at ${PORT}`);
  // 기존 DB 에 없는 컬럼/테이블(필수 근무일, comp 휴무, 매장/계정 관리 등)을 자동으로 보강
  try {
    await new AgentinfoRepository().ensureAgentSchema();
  } catch (err) {
    console.error('ensureAgentSchema failed', err);
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 로그인(/login, /superadmin-login)은 공개, 계정 생성/재설정은 라우터 내부에서 requireAuth 적용
app.use('/apis/auth', auth);
// 매장 데이터는 전부 인증 필요 (요청의 storeId 는 토큰에서만 신뢰)
app.use('/apis/agentinfo', requireAuth, agentinfo);
// 슈퍼관리자 전용 — requireAuth 로 토큰만 검증하고, 슈퍼관리자인지는 각 컨트롤러에서 한 번 더 확인
app.use('/apis/superadmin', requireAuth, superadmin);

export = app;
