import { enhance, type UniversalHandler } from "@universal-middleware/core";
import { serve } from "telefunc";

// Note: Vike's Universal Middleware provides the page and auth context before
// this handler runs, so Telefunc must remain in the same Vike request chain.
export const telefuncHandler: UniversalHandler = enhance(
  async (request, context, runtime) => {
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
  },
  {
    name: "my-app:telefunc-handler",
    path: `/_telefunc`,
    method: ["GET", "POST"],
    immutable: false,
  },
);
