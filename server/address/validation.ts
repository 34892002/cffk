import { appError } from "@/lib/app-error";

export type AddressInput = {
  recipientName?: unknown;
  phone?: unknown;
  country?: unknown;
  province?: unknown;
  city?: unknown;
  district?: unknown;
  addressLine?: unknown;
  postalCode?: unknown;
  isDefault?: unknown;
};

export type ValidatedAddressInput = {
  recipientName: string;
  phone: string;
  country: string;
  province: string;
  city: string;
  district: string;
  addressLine: string;
  postalCode: string | null;
  isDefault: boolean;
};

const phonePattern = /^[0-9+()\-\s]{5,32}$/;
const postalCodePattern = /^[A-Za-z0-9][A-Za-z0-9\- ]{0,19}$/;

function requiredText(value: unknown, maxLength: number) {
  if (typeof value !== "string") appError("ADDRESS_INPUT_INVALID");
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) appError("ADDRESS_INPUT_INVALID");
  return normalized;
}

function optionalText(value: unknown, maxLength: number) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") appError("ADDRESS_INPUT_INVALID");
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) appError("ADDRESS_INPUT_INVALID");
  return normalized;
}

export function validateAddressId(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) appError("ADDRESS_INPUT_INVALID");
  return value;
}

export function validateAddressInput(input: unknown): ValidatedAddressInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) appError("ADDRESS_INPUT_INVALID");
  const value = input as AddressInput;
  const recipientName = requiredText(value.recipientName, 100);
  const phone = requiredText(value.phone, 32);
  const country = requiredText(value.country, 100);
  const province = requiredText(value.province, 100);
  const city = requiredText(value.city, 100);
  const district = requiredText(value.district, 100);
  const addressLine = requiredText(value.addressLine, 500);
  const postalCode = optionalText(value.postalCode, 20);

  if (!phonePattern.test(phone)) appError("ADDRESS_INPUT_INVALID");
  if (postalCode && !postalCodePattern.test(postalCode)) appError("ADDRESS_INPUT_INVALID");
  if (value.isDefault !== undefined && typeof value.isDefault !== "boolean") appError("ADDRESS_INPUT_INVALID");

  return {
    recipientName,
    phone,
    country,
    province,
    city,
    district,
    addressLine,
    postalCode,
    isDefault: value.isDefault === true,
  };
}
