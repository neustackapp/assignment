// Every failure the API can return is an ApiError with a stable machine-readable `code`.
// Clients should branch on `code`, never on `message`.
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, msg: string, details?: unknown) => new ApiError(400, code, msg, details);
export const notFound = (code: string, msg: string, details?: unknown) => new ApiError(404, code, msg, details);
export const conflict = (code: string, msg: string, details?: unknown) => new ApiError(409, code, msg, details);
export const unprocessable = (code: string, msg: string, details?: unknown) => new ApiError(422, code, msg, details);
