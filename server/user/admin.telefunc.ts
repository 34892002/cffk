import { and, count, desc, eq, isNull, like, ne, or } from "drizzle-orm";
import type { RuntimeAdapter } from "@universal-middleware/core";
import { adminBootstrap, session, user } from "@/database/drizzle/schema";
import { createServerAuth } from "@/server/better-auth";
import { appError } from "@/lib/app-error";
import { requireAdmin } from "@/server/telefunc-context";
import { telefuncAction } from "@/server/telefunc-action";

function text(value: unknown, code: string, maxLength: number) {
  if (typeof value !== "string") appError(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) appError(code);
  return normalized;
}

async function internalOnGetAdminUsers(input?: { query?: string; page?: number; pageSize?: number }) {
  const { db } = requireAdmin();
  const page = Math.max(1, Math.floor(input?.page ?? 1));
  const pageSize = Math.min(100, Math.max(10, Math.floor(input?.pageSize ?? 20)));
  const query = input?.query?.trim().slice(0, 128);
  const where = and(
    isNull(adminBootstrap.userId),
    query ? or(like(user.name, `%${query}%`), like(user.email, `%${query}%`)) : undefined,
  );
  const [users, totalRows] = await Promise.all([
    db.select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      disabledAt: user.disabledAt,
      twoFactorEnabled: user.twoFactorEnabled,
      createdAt: user.createdAt,
    })
      .from(user)
      .leftJoin(adminBootstrap, and(eq(adminBootstrap.id, 1), eq(adminBootstrap.userId, user.id)))
      .where(where)
      .orderBy(desc(user.createdAt), desc(user.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() })
      .from(user)
      .leftJoin(adminBootstrap, and(eq(adminBootstrap.id, 1), eq(adminBootstrap.userId, user.id)))
      .where(where),
  ]);

  return {
    users,
    total: totalRows[0]?.value ?? 0,
    page,
    pageSize,
  };
}

async function internalOnCreateAdminUser(input: { name?: unknown; email?: unknown; password?: unknown }) {
  const { db, runtime } = requireAdmin();
  const name = text(input?.name, "ADMIN_USER_NAME_INVALID", 100);
  const email = text(input?.email, "ADMIN_USER_EMAIL_INVALID", 320).toLowerCase();
  const password = text(input?.password, "ADMIN_USER_PASSWORD_INVALID", 128);

  if (!/^\S+@\S+\.\S+$/.test(email)) appError("ADMIN_USER_EMAIL_INVALID");
  if (password.length < 8) appError("ADMIN_USER_PASSWORD_INVALID");
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (existing) appError("ADMIN_USER_EMAIL_CONFLICT");

  const authRuntime = { runtime: "workerd", env: runtime } as unknown as RuntimeAdapter;
  const auth = createServerAuth(authRuntime);
  try {
    const context = await auth.$context;
    const created = await context.internalAdapter.createUser({ name, email, emailVerified: true });
    if (!created) appError("ADMIN_USER_CREATE_FAILED");
    await context.internalAdapter.linkAccount({
      userId: created.id,
      providerId: "credential",
      accountId: created.id,
      password: await context.password.hash(password),
    });
    return { id: created.id };
  } catch (cause) {
    if (cause instanceof Error && /unique|email/i.test(cause.message)) appError("ADMIN_USER_EMAIL_CONFLICT");
    appError("ADMIN_USER_CREATE_FAILED");
  }
}

async function internalOnUpdateAdminUser(input: { userId?: unknown; name?: unknown; email?: unknown; password?: unknown }) {
  const { db, runtime } = requireAdmin();
  const userId = text(input?.userId, "ADMIN_USER_NOT_FOUND", 255);
  const name = text(input?.name, "ADMIN_USER_NAME_INVALID", 100);
  const email = text(input?.email, "ADMIN_USER_EMAIL_INVALID", 320).toLowerCase();
  const password = input?.password === undefined || input.password === null ? "" : typeof input.password === "string" ? input.password : appError("ADMIN_USER_PASSWORD_INVALID");
  if (!/^\S+@\S+\.\S+$/.test(email)) appError("ADMIN_USER_EMAIL_INVALID");
  if (password && (password.length < 8 || password.length > 128)) appError("ADMIN_USER_PASSWORD_INVALID");

  const [target] = await db.select({ id: user.id, email: user.email })
    .from(user)
    .leftJoin(adminBootstrap, and(eq(adminBootstrap.id, 1), eq(adminBootstrap.userId, user.id)))
    .where(and(eq(user.id, userId), isNull(adminBootstrap.userId)))
    .limit(1);
  if (!target) appError("ADMIN_USER_NOT_FOUND");

  const [existing] = await db.select({ id: user.id }).from(user).where(and(eq(user.email, email), ne(user.id, userId))).limit(1);
  if (existing) appError("ADMIN_USER_EMAIL_CONFLICT");

  const authRuntime = { runtime: "workerd", env: runtime } as unknown as RuntimeAdapter;
  const auth = createServerAuth(authRuntime);
  try {
    const context = await auth.$context;
    await context.internalAdapter.updateUser(userId, { name, email, emailVerified: true });
    if (password) await context.internalAdapter.updatePassword(userId, await context.password.hash(password));
    if (email !== target.email || password) await db.delete(session).where(eq(session.userId, userId));
  } catch (cause) {
    if (cause instanceof Error && /unique|email/i.test(cause.message)) appError("ADMIN_USER_EMAIL_CONFLICT");
    appError("ADMIN_USER_UPDATE_FAILED");
  }
}

async function internalOnSetAdminUserDisabled(input: { userId?: unknown; disabled?: unknown }) {
  const { db, adminUserId } = requireAdmin();
  const userId = text(input?.userId, "ADMIN_USER_NOT_FOUND", 255);
  if (typeof input?.disabled !== "boolean") appError("ADMIN_USER_STATUS_INVALID");
  if (userId === adminUserId) appError("ADMIN_SELF_STATUS_CHANGE_FORBIDDEN");

  const [target] = await db.select({ id: user.id, isRoot: adminBootstrap.userId })
    .from(user)
    .leftJoin(adminBootstrap, and(eq(adminBootstrap.id, 1), eq(adminBootstrap.userId, user.id)))
    .where(eq(user.id, userId))
    .limit(1);
  if (!target) appError("ADMIN_USER_NOT_FOUND");
  if (target.isRoot) appError("ADMIN_ROOT_USER_STATUS_CHANGE_FORBIDDEN");

  if (input.disabled) {
    await db.batch([
      db.update(user).set({ disabledAt: new Date(), updatedAt: new Date() }).where(eq(user.id, userId)),
      db.delete(session).where(eq(session.userId, userId)),
    ]);
  } else {
    await db.update(user).set({ disabledAt: null, updatedAt: new Date() }).where(eq(user.id, userId));
  }
}

export const onGetAdminUsers = telefuncAction(internalOnGetAdminUsers);
export const onCreateAdminUser = telefuncAction(internalOnCreateAdminUser);
export const onUpdateAdminUser = telefuncAction(internalOnUpdateAdminUser);
export const onSetAdminUserDisabled = telefuncAction(internalOnSetAdminUserDisabled);
