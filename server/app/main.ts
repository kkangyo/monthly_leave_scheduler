import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config({ path: '../../config/.server.env' });

const app = express();
const PORT = process.env.PORT || 8000;

import agentinfo from './src/apis/agentinfo';
import AgentinfoRepository from './src/model/agentinfoRepository';

app.use(cors());

app.listen(PORT, async () => {
  console.log(`server start at ${PORT}`);
  // 기존 DB 에 mandatory_workday(필수 근무일) 컬럼이 없으면 추가
  try {
    await new AgentinfoRepository().ensureAgentSchema();
  } catch (err) {
    console.error('ensureAgentSchema failed', err);
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/apis/agentinfo', agentinfo);

export = app;
