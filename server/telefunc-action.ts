import { Abort } from "telefunc";

import { AppError } from "@/lib/app-error";

/**
 * Converts domain errors into Telefunc's expected business-error control flow.
 * Unexpected errors remain untouched so Telefunc reports them as server bugs.
 */
export function telefuncAction<Args extends unknown[], Result>(action: (...args: Args) => Result) {
  return async (...args: Args): Promise<Awaited<Result>> => {
    try {
      return await action(...args);
    } catch (cause) {
      if (cause instanceof AppError) throw Abort({ code: cause.code });
      throw cause;
    }
  };
}
