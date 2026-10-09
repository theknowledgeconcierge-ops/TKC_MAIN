import "server-only";
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const unavailable = () =>
  new HttpError(
    503,
    "SERVICE_UNAVAILABLE",
    "Checkout is temporarily unavailable. Please try again shortly.",
  );
