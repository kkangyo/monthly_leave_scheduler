export class ServerError extends Error {
  code: number;
  constructor(message: string) {
    super(message);
    this.name = 'ServerError';
    this.code = 500;
  }
}

export class BadRequestError extends Error {
  code: number;
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
    this.code = 400;
  }
}

export class NotFoundError extends Error {
  code: number;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
    this.code = 404;
  }
}

export class UnauthorizedError extends Error {
  code: number;
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedError';
    this.code = 401;
  }
}

export class ForbiddenError extends Error {
  code: number;
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
    this.code = 403;
  }
}
