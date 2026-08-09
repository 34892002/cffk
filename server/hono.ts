import { betterAuthHandler, betterAuthSessionMiddleware } from "./better-auth-handler";
import { PaymentCallbackService } from "./payment/callback-service";
import { MAX_PAYMENT_CALLBACK_BYTES, normalizePaymentCallbackPayload } from "./payment/callback-payload";
import { reportUnexpectedRequestError } from "./error-handling";
import { registerMediaRoutes } from "./media/routes";
import { telefuncHandler } from "./telefunc-handler";
import vike from "@vikejs/hono";
import { Hono, type Context } from "hono";
import type { PaymentProviderKind } from "./payment/registry";

function getApp() {
  const app = new Hono<{ Bindings: Record<string, unknown> & { DB: D1Database } }>();
  app.onError(async (error, context) => {
    await reportUnexpectedRequestError("hono", error, context.req.raw);
    if (context.req.path.startsWith("/api/payments/")) return context.text("failure", 500);
    if (context.req.path.startsWith("/api/")) return context.json({ code: "INTERNAL_ERROR", message: "接口异常，请稍后重试。", data: null }, 500);
    return context.text("Internal Server Error", 500);
  });
  for (const [provider, path] of [["ALIPAY", "/api/payments/alipay/notify"], ["EPAY", "/api/payments/epay/notify"], ["BEPUSDT", "/api/payments/bepusdt/notify"], ["STRIPE", "/api/payments/stripe/notify"], ["HASHPAY", "/api/payments/hashpay/notify"]] as const) {
    const handlePaymentCallback = async (context: Context<{ Bindings: Record<string, unknown> & { DB: D1Database } }>) => {
      const contentLength = Number(context.req.header("content-length"));
      if (Number.isFinite(contentLength) && contentLength > MAX_PAYMENT_CALLBACK_BYTES) return context.text("failure", 400);
      const rawBody = await context.req.text();
      const payload = normalizePaymentCallbackPayload(context.req.method, context.req.url, rawBody);
      const result = await new PaymentCallbackService(context.env.DB, context.env).handle(provider as PaymentProviderKind, { payload, rawBody, headers: context.req.raw.headers });
      return context.body(result.body, result.status as 200 | 400, { "content-type": result.contentType });
    };
    app.all(path, handlePaymentCallback);
    app.all(`${path}/*`, handlePaymentCallback);
  }
  registerMediaRoutes(app);
  vike(app, [betterAuthSessionMiddleware, betterAuthHandler, telefuncHandler]);
  return app;
}
export const app = getApp();
