import { toast } from "vue-sonner";
import { userErrorMessage } from "./error-messages";

export type TelefuncOptions = {
  successMessage?: string;
  errorMessage?: string;
  notifyError?: boolean;
};

/**
 * The only client-side entry point for Telefunc calls that need user feedback.
 * It normalizes expected business errors and unexpected transport/server errors
 * into a single Sonner toast, then rethrows so callers can restore UI state.
 */
export async function runTelefunc<T>(request: () => Promise<T>, options: TelefuncOptions = {}) {
  try {
    const result = await request();
    if (options.successMessage) toast.success(options.successMessage);
    return result;
  } catch (cause) {
    if (options.notifyError !== false) toast.error(options.errorMessage ?? userErrorMessage(cause));
    throw cause;
  }
}

export { userErrorMessage } from "./error-messages";
