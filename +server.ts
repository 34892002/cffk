import type { Server } from "vike/types";

type CloudflareServer = Server & {
  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void>;
};
import { app } from "./server/hono";
import { runScheduledMaintenance } from "./server/scheduled";

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// https://vike.dev/server
export default {
  fetch: app.fetch,
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduledMaintenance(env.DB, env as unknown as Record<string, unknown>, new Date(controller.scheduledTime)));
  },
  prod: {
    port,
  },
} satisfies CloudflareServer;
