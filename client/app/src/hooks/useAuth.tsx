import React, { createContext, useContext, useEffect, useState } from "react";
import authAPI from "../apis/auth";
import {
  AuthProfile,
  clearSession,
  getProfile,
  getToken,
  onUnauthorized,
  setSession,
} from "../apis/authToken";

interface AuthContextValue {
  isAuthenticated: boolean;
  profile: AuthProfile | null;
  login: (storeCode: string, loginId: string, password: string) => Promise<{ ok: boolean; msg?: string }>;
  logout: () => void;
  // 슈퍼관리자 전용: 보고 있는 매장을 바꾼다(토큰은 그대로, X-Store-Id 로 쓰이는 profile.storeId 만 교체)
  switchStore: (storeId: string, storeName: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [profile, setProfile] = useState<AuthProfile | null>(() => (getToken() ? getProfile() : null));

  // instance.ts 가 401 응답을 받으면(토큰 없음/만료) 여기로 알려줘서 로그인 화면으로 돌려보낸다.
  useEffect(() => {
    onUnauthorized(() => {
      clearSession();
      setProfile(null);
    });
    return () => onUnauthorized(null);
  }, []);

  const login = async (storeCode: string, loginId: string, password: string) => {
    const result = await authAPI.login(storeCode, loginId, password);
    if (!result?.token || !result?.profile) {
      return { ok: false, msg: result?.msg ?? "로그인에 실패했습니다." };
    }
    setSession(result.token, result.profile);
    setProfile(result.profile);
    return { ok: true };
  };

  const logout = () => {
    clearSession();
    setProfile(null);
  };

  const switchStore = (storeId: string, storeName: string) => {
    const token = getToken();
    if (!token || !profile?.isSuperadmin) return;
    const next = { ...profile, storeId, storeName };
    setSession(token, next);
    setProfile(next);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated: !!profile, profile, login, logout, switchStore }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
