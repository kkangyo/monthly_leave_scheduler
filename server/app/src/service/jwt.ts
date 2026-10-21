import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || '';
const EXPIRES_IN = '7d';

export interface StoreTokenPayload {
  kind: 'store';
  accountId: string;
  storeId: string;
  agentId: string;
  loginId: string;
}

export interface SuperadminTokenPayload {
  kind: 'superadmin';
  loginId: string;
}

export type TokenPayload = StoreTokenPayload | SuperadminTokenPayload;

export const signToken = (payload: TokenPayload): string =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: EXPIRES_IN });

// jwt.verify 가 뭘 반환하든(JwtPayload|string) 우리가 서명한 payload 모양 그대로 돌려받는다고 신뢰.
export const verifyToken = (token: string): TokenPayload =>
  jwt.verify(token, JWT_SECRET) as unknown as TokenPayload;
