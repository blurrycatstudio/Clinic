export class AppError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly details?: unknown

  constructor(message: string, statusCode = 500, code = "INTERNAL_ERROR", details?: unknown) {
    super(message)
    this.name = "AppError"
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found", details?: unknown) {
    super(message, 404, "NOT_FOUND", details)
  }
}

export class ValidationError extends AppError {
  constructor(message = "Invalid request", details?: unknown) {
    super(message, 400, "VALIDATION_ERROR", details)
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict", details?: unknown) {
    super(message, 409, "CONFLICT", details)
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED")
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, details?: unknown) {
    super(`${service}: ${message}`, 502, "EXTERNAL_SERVICE_ERROR", details)
  }
}
