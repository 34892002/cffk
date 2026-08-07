import { betterAuthHandler, betterAuthSessionMiddleware } from "./better-auth-handler";
import { handleAlipayCallback } from "./payment/callback";
import { telefuncHandler } from "./telefunc-handler";
import vike from "@vikejs/hono";
import { Hono } from "hono";

function getApp() {
  const app = new Hono<{ Bindings: Record<string, unknown> & { DB: D1Database } }>();

  app.onError((error, context) => {
    console.error("Unhandled HTTP API error", error);
    // Alipay requires a plain-text response; do not apply the JSON API envelope.
    if (context.req.path === "/api/payments/alipay/notify") return context.text("failure", 500);
    if (context.req.path.startsWith("/api/")) {
      return context.json({ code: "INTERNAL_ERROR", message: "接口异常，请稍后重试。", data: null }, 500);
    }
    return context.text("Internal Server Error", 500);
  });

  app.post("/api/payments/alipay/notify", async (context) => {
    const formData = await context.req.formData().catch(() => null);
    if (!formData) return context.text("failure", 400);
    const result = await handleAlipayCallback(context.env.DB, context.env, Object.fromEntries(formData.entries()));
    return context.text(result.body, result.ok ? 200 : 400);
  });

  vike(app, [
    betterAuthSessionMiddleware,
    betterAuthHandler,
    telefuncHandler,
  ]);

  return app;
}

export const app = getApp();
