import React, { useState } from "react";
import { useAuth } from "./hooks/useAuth";

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  border: "1px solid #ccc",
  borderRadius: "6px",
  fontSize: "14px",
};

const Login: React.FC = () => {
  const { login } = useAuth();
  const [storeCode, setStoreCode] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeCode || !loginId || !password) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await login(storeCode, loginId, password);
      if (!result.ok) setError(result.msg ?? "로그인에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", padding: "0 16px" }}>
      <h1 style={{ textAlign: "center", fontSize: "20px", marginBottom: "24px" }}>
        휴무 Scheduler 로그인
      </h1>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <input
          type="text"
          placeholder="매장 코드"
          value={storeCode}
          onChange={(e) => setStoreCode(e.target.value)}
          autoComplete="organization"
          style={inputStyle}
        />
        <input
          type="text"
          placeholder="아이디"
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          autoComplete="username"
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          style={inputStyle}
        />
        {error && <div style={{ color: "#d93025", fontSize: "13px" }}>{error}</div>}
        <button type="submit" className="btn" disabled={isSubmitting}>
          {isSubmitting ? "로그인 중..." : "로그인"}
        </button>
      </form>
    </div>
  );
};

export default Login;
