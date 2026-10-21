import { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../../service/jwt';
import { ForbiddenError, UnauthorizedError } from '../../service/error';
import errorResposne from './error';

// JWT 검증 후 req.auth 를 채운다. 매장 계정 토큰은 storeId 가 토큰에 고정돼있어 그대로 쓰고,
// 슈퍼관리자 토큰은 요청의 X-Store-Id 헤더를 "신뢰해서" storeId 로 쓴다 — 이 분기가 매장 간
// 데이터 격리의 핵심이다: 클라이언트가 보낸 storeId 는 슈퍼관리자가 아니면 절대 신뢰하지 않는다.
const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const header = req.header('Authorization') || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedError('Authorization 헤더가 필요합니다');
    }

    const payload = verifyToken(token);

    if (payload.kind === 'superadmin') {
      req.auth = {
        kind: 'superadmin',
        loginId: payload.loginId,
        storeId: req.header('X-Store-Id') || null,
      };
    } else {
      req.auth = {
        kind: 'store',
        accountId: payload.accountId,
        storeId: payload.storeId,
        agentId: payload.agentId,
        loginId: payload.loginId,
      };
    }
    next();
  } catch (err) {
    errorResposne(new UnauthorizedError('인증에 실패했습니다'), res);
  }
};

// 요청의 storeId 를 꺼낸다 — 매장 계정이면 토큰 고정값, 슈퍼관리자면 X-Store-Id 헤더값
// (없으면 매장을 특정할 수 없으니 에러).
export const resolveStoreId = (req: Request): string => {
  if (!req.auth) throw new UnauthorizedError('인증 정보가 없습니다');
  if (!req.auth.storeId) throw new ForbiddenError('슈퍼관리자는 X-Store-Id 헤더로 대상 매장을 지정해야 합니다');
  return req.auth.storeId;
};

export default requireAuth;
