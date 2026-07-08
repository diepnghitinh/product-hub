/**
 * Base class for domain/application errors. Carries an HTTP `statusCode` so the
 * {@link DomainExceptionsFilter} can translate it without leaking stack traces.
 * Use-cases usually return `Result.fail(...)`; throw these when a controller or
 * service needs a specific HTTP status.
 */
export class DomainException extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class EntityNotFoundException extends DomainException {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

export class ValidationException extends DomainException {
  constructor(message = 'Validation failed') {
    super(message, 400);
  }
}

export class ForbiddenDomainException extends DomainException {
  constructor(message = 'You are not allowed to perform this action') {
    super(message, 403);
  }
}

export class ConflictException extends DomainException {
  constructor(message = 'Resource already exists') {
    super(message, 409);
  }
}

export class UnauthorizedDomainException extends DomainException {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}
