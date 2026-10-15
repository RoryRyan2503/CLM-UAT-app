export class AppError extends Error {
  code: "UNAUTHENTICATED" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "VALIDATION";
  fieldErrors?: Record<string, string>;

  constructor(
    code: AppError["code"],
    message: string,
    fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: AppError["code"]; fieldErrors?: Record<string, string> };

export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: error.message, code: error.code, fieldErrors: error.fieldErrors };
    }
    console.error(error);
    return { ok: false, error: "Something went wrong. Please try again.", code: "VALIDATION" };
  }
}
