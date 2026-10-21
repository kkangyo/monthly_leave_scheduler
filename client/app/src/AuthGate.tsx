import React from "react";
import { useAuth } from "./hooks/useAuth";
import { AgentProvider } from "./hooks/useAgentinfo";
import Login from "./Login";
import App from "./App";

// 로그인 전엔 AgentProvider 를 아예 마운트하지 않는다 — 그 안의 useEffect 들이 마운트되자마자
// (인증 없이) /apis/agentinfo/* 를 호출하므로, 로그인 화면 단계에서는 그 provider 가 없어야 한다.
const AuthGate: React.FC = () => {
  const { isAuthenticated, profile } = useAuth();
  if (!isAuthenticated) return <Login />;
  // 슈퍼관리자가 매장을 전환하면 storeId 가 바뀌므로 key 로 provider 를 통째로 다시 마운트해서
  // 이전 매장의 상태(직원 목록/스케줄 등)를 버리고 새 매장 데이터를 처음부터 불러온다.
  return (
    <AgentProvider key={profile?.storeId}>
      <App />
    </AgentProvider>
  );
};

export default AuthGate;
