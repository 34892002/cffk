import { enhance, type UniversalHandler } from "@universal-middleware/core";
import { onBug, serve } from "telefunc";
import { reportUnexpectedRequestError, reportUnexpectedServerError } from "./error-handling";

onBug((cause) => {
  reportUnexpectedServerError("telefunc", cause);
});

// Note: Vike's Universal Middleware provides the page and auth context before
// this handler runs, so Telefunc must remain in the same Vike request chain.
export const telefuncHandler: UniversalHandler = enhance(
  async (request, context, runtime) => {
    try {
      const httpResponse = await serve({
        request,
        context: {
          ...(context as object),
          ...(runtime as { runtime: "workerd"; env?: { DB: D1Database } }),
        },
      });

      return new Response(httpResponse.getReadableWebStream(), {
        status: httpResponse.statusCode,
        headers: httpResponse.headers,
      });
    } catch (cause) {
      await reportUnexpectedRequestError("telefunc transport", cause, request);
      throw cause;
    }
  },
  {
    name: "my-app:telefunc-handler",
    path: `/_telefunc`,
    method: ["GET", "POST"],
    immutable: false,
  },
);
