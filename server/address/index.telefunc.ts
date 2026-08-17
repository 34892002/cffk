import { and, asc, eq } from "drizzle-orm";
import { customerAddress } from "@/database/drizzle/schema";
import { appError } from "@/lib/app-error";
import { telefuncAction } from "@/server/telefunc-action";
import { requireUser } from "@/server/telefunc-context";
import { validateAddressId, validateAddressInput, type AddressInput } from "./validation";

const addressSelection = {
  id: customerAddress.id,
  recipientName: customerAddress.recipientName,
  phone: customerAddress.phone,
  country: customerAddress.country,
  province: customerAddress.province,
  city: customerAddress.city,
  district: customerAddress.district,
  addressLine: customerAddress.addressLine,
  postalCode: customerAddress.postalCode,
  isDefault: customerAddress.isDefault,
  createdAt: customerAddress.createdAt,
  updatedAt: customerAddress.updatedAt,
};

async function internalOnListAddresses() {
  const { db, user } = requireUser();
  return db
    .select(addressSelection)
    .from(customerAddress)
    .where(eq(customerAddress.userId, user.id))
    .orderBy(asc(customerAddress.createdAt), asc(customerAddress.id));
}

async function internalOnCreateAddress(input: AddressInput) {
  const { database, db, user } = requireUser();
  const address = validateAddressInput(input);
  const now = Date.now();
  const makeDefault = address.isDefault;

  let createdId: number;
  try {
    const [, inserted] = await database.batch([
      database.prepare("UPDATE customerAddress SET isDefault = 0, updatedAt = ? WHERE userId = ? AND isDefault = 1 AND ? = 1")
        .bind(now, user.id, makeDefault ? 1 : 0),
      database.prepare(`INSERT INTO customerAddress
        (userId, recipientName, phone, country, province, city, district, addressLine, postalCode, isDefault, createdAt, updatedAt)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?,
          CASE WHEN ? = 1 OR NOT EXISTS (SELECT 1 FROM customerAddress WHERE userId = ?) THEN 1 ELSE 0 END,
          ?, ?
        WHERE (SELECT count(*) FROM customerAddress WHERE userId = ?) < 10`)
        .bind(user.id, address.recipientName, address.phone, address.country, address.province, address.city, address.district, address.addressLine, address.postalCode, makeDefault ? 1 : 0, user.id, now, now, user.id),
      database.prepare("INSERT INTO transactionGuard (id, value) VALUES (1, changes()) ON CONFLICT(id) DO UPDATE SET value = excluded.value"),
    ]);
    createdId = inserted.meta.last_row_id;
  } catch {
    appError("ADDRESS_LIMIT_EXCEEDED");
  }

  const [created] = await db
    .select(addressSelection)
    .from(customerAddress)
    .where(and(eq(customerAddress.userId, user.id), eq(customerAddress.id, createdId)))
    .limit(1);
  if (!created) appError("ADDRESS_CREATE_FAILED");
  return created;
}

async function internalOnUpdateAddress(id: unknown, input: AddressInput) {
  const addressId = validateAddressId(id);
  const address = validateAddressInput(input);
  const { database, db, user } = requireUser();
  const now = Date.now();

  try {
    await database.batch([
      database.prepare(`UPDATE customerAddress SET
        recipientName = ?, phone = ?, country = ?, province = ?, city = ?, district = ?, addressLine = ?, postalCode = ?,
        isDefault = CASE WHEN ? = 1 THEN 1 ELSE isDefault END, updatedAt = ?
        WHERE id = ? AND userId = ?`)
        .bind(address.recipientName, address.phone, address.country, address.province, address.city, address.district, address.addressLine, address.postalCode, address.isDefault ? 1 : 0, now, addressId, user.id),
      database.prepare("INSERT INTO transactionGuard (id, value) VALUES (1, changes()) ON CONFLICT(id) DO UPDATE SET value = excluded.value"),
      database.prepare("UPDATE customerAddress SET isDefault = 0, updatedAt = ? WHERE userId = ? AND id != ? AND isDefault = 1 AND ? = 1")
        .bind(now, user.id, addressId, address.isDefault ? 1 : 0),
    ]);
  } catch {
    appError("ADDRESS_NOT_FOUND");
  }

  const [updated] = await db
    .select(addressSelection)
    .from(customerAddress)
    .where(and(eq(customerAddress.id, addressId), eq(customerAddress.userId, user.id)))
    .limit(1);
  if (!updated) appError("ADDRESS_NOT_FOUND");
  return updated;
}

async function internalOnSetDefaultAddress(id: unknown) {
  const addressId = validateAddressId(id);
  const { database, db, user } = requireUser();
  const now = Date.now();

  try {
    await database.batch([
      database.prepare("UPDATE customerAddress SET isDefault = 1, updatedAt = ? WHERE id = ? AND userId = ?")
        .bind(now, addressId, user.id),
      database.prepare("INSERT INTO transactionGuard (id, value) VALUES (1, changes()) ON CONFLICT(id) DO UPDATE SET value = excluded.value"),
      database.prepare("UPDATE customerAddress SET isDefault = 0, updatedAt = ? WHERE userId = ? AND id != ? AND isDefault = 1")
        .bind(now, user.id, addressId),
    ]);
  } catch {
    appError("ADDRESS_NOT_FOUND");
  }

  const [updated] = await db
    .select(addressSelection)
    .from(customerAddress)
    .where(and(eq(customerAddress.id, addressId), eq(customerAddress.userId, user.id)))
    .limit(1);
  if (!updated) appError("ADDRESS_NOT_FOUND");
  return updated;
}

async function internalOnDeleteAddress(id: unknown) {
  const addressId = validateAddressId(id);
  const { database, user } = requireUser();
  const now = Date.now();

  try {
    await database.batch([
      database.prepare("DELETE FROM customerAddress WHERE id = ? AND userId = ?")
        .bind(addressId, user.id),
      database.prepare("INSERT INTO transactionGuard (id, value) VALUES (1, changes()) ON CONFLICT(id) DO UPDATE SET value = excluded.value"),
      database.prepare(`UPDATE customerAddress SET isDefault = 1, updatedAt = ?
        WHERE id = (SELECT id FROM customerAddress WHERE userId = ? ORDER BY createdAt ASC, id ASC LIMIT 1)
          AND userId = ? AND NOT EXISTS (SELECT 1 FROM customerAddress WHERE userId = ? AND isDefault = 1)`)
        .bind(now, user.id, user.id, user.id),
    ]);
  } catch {
    appError("ADDRESS_NOT_FOUND");
  }

  return { success: true };
}

export const onListAddresses = telefuncAction(internalOnListAddresses);
export const onCreateAddress = telefuncAction(internalOnCreateAddress);
export const onUpdateAddress = telefuncAction(internalOnUpdateAddress);
export const onSetDefaultAddress = telefuncAction(internalOnSetDefaultAddress);
export const onDeleteAddress = telefuncAction(internalOnDeleteAddress);
