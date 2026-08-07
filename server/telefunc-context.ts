import { getContext } from "telefunc";
import { createDrizzleDb } from "@/database/drizzle";
import { appError } from "@/lib/app-error";

export type TelefuncContext = {
  env?: Record<string, unknown> & { DB?: D1Database };
  user?: { id: string } | null;
  isAdmin?: boolean;
};

export function requireDatabase() {
  const context = getContext<TelefuncContext>();
  if (!context.env?.DB) appError("DATABASE_UNAVAILABLE");
  return { context, database: context.env.DB, runtime: context.env, db: createDrizzleDb(context.env.DB) };
}

export function requireUser() {
  const result = requireDatabase();
  if (!result.context.user) appError("AUTH_REQUIRED");
  return { ...result, user: result.context.user };
}

export function requireAdmin() {
  const result = requireUser();
  if (!result.context.isAdmin) appError("ADMIN_ACCESS_REQUIRED");
  return { ...result, adminUserId: result.user.id };
}
