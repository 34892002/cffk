import { userErrorMessage } from "./error-messages";

export async function mediaApiError(response: Response): Promise<Error> {
  try {
    const payload = await response.clone().json() as { code?: unknown; message?: unknown };
    if (typeof payload.code === "string") return new Error(payload.code);
    if (typeof payload.message === "string") return new Error(payload.message);
  } catch {
    // Non-JSON responses use the generic sanitized message.
  }
  return new Error("MEDIA_UPLOAD_FAILED");
}

export function mediaApiUserError(cause: unknown) {
  return userErrorMessage(cause);
}
