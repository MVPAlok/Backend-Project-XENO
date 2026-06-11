export class AppError extends Error {
  constructor(message, statusCode, title = 'Application Error', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.title = title;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'Bad Request / Validation Error', details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed or credentials invalid') {
    super(message, 401, 'Unauthorized');
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, 403, 'Forbidden');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'The requested resource was not found') {
    super(message, 404, 'Not Found');
  }
}

export class ConflictError extends AppError {
  constructor(message) {
    super(message, 409, 'Conflict');
  }
}
