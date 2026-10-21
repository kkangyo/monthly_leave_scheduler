// 로그인 토큰 저장소. instance.ts(모든 fetch 요청)와 useAuth.tsx(로그인/로그아웃) 양쪽이
// 같은 값을 보도록 작은 모듈로 분리 — localStorage 를 직접 여기저기서 읽고 쓰지 않는다.
const TOKEN_KEY = 'shunii_auth_token';
const PROFILE_KEY = 'shunii_auth_profile';

export interface AuthProfile {
  storeId: string;
  storeName: string;
  agentId: string;
  name: string;
  jobLevel: string;
  isAdmin: boolean;
  isSuperadmin?: boolean; // 슈퍼관리자 — storeId/storeName 은 "지금 보고 있는 매장"(전환 가능)
}

export const getToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const getProfile = (): AuthProfile | null => {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as AuthProfile) : null;
  } catch {
    return null;
  }
};

export const setSession = (token: string, profile: AuthProfile): void => {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // localStorage 불가(사생활 보호 모드 등) — 세션 유지는 안 되지만 로그인 자체는 진행
  }
};

export const clearSession = (): void => {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PROFILE_KEY);
  } catch {
    // ignore
  }
};

// 401 응답을 받았을 때(토큰 만료 등) 전역적으로 로그아웃시키기 위한 리스너
type UnauthorizedListener = () => void;
let unauthorizedListener: UnauthorizedListener | null = null;

export const onUnauthorized = (listener: UnauthorizedListener | null): void => {
  unauthorizedListener = listener;
};

export const notifyUnauthorized = (): void => {
  unauthorizedListener?.();
};
