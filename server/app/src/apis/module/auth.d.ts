// 매장 계정 토큰으로 인증된 요청의 컨텍스트
export interface StoreAuthContext {
  kind: 'store';
  accountId: string;
  storeId: string;
  agentId: string;
  loginId: string;
}

// 슈퍼관리자 토큰으로 인증된 요청의 컨텍스트. storeId 는 요청이 X-Store-Id 헤더로
// 명시했을 때만 채워진다(슈퍼관리자는 매장에 묶여있지 않으므로 토큰 자체엔 없음).
export interface SuperadminAuthContext {
  kind: 'superadmin';
  loginId: string;
  storeId: string | null;
}

export type AuthContext = StoreAuthContext | SuperadminAuthContext;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}
