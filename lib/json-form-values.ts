export type JsonFormInputValue = string | number | boolean | string[];
export type JsonFormSubmitValue = JsonFormInputValue | null;
export type JsonFormValues = Record<string, JsonFormInputValue>;
export type JsonFormSubmitValues = Record<string, JsonFormSubmitValue>;
export type JsonFormFieldDefinition = {
  key: string;
  label: string;
  type: "text" | "email" | "number" | "password" | "url" | "switch" | "select" | "multi_select" | "textarea";
  required?: boolean;
  placeholder?: string;
  description?: string;
  secret?: boolean;
  min?: number;
  max?: number;
  options?: Array<{ label: string; value: string }>;
};
export type JsonFormDefinition = {
  provider: string;
  schemaVersion: number;
  title: string;
  fields: JsonFormFieldDefinition[];
  defaults: JsonFormValues;
};

export function normalizeJsonFormInputValue(type: string, value: unknown): JsonFormInputValue {
  if (type !== "number") return typeof value === "string" ? value : "";
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  if (typeof value !== "string" || !value.trim()) return "";
  const number = Number(value);
  return Number.isFinite(number) ? number : "";
}

export function validateJsonFormValues(fields: readonly JsonFormFieldDefinition[], values: Record<string, unknown>) {
  for (const field of fields) {
    const value = values[field.key];
    const missing = value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
    if (missing) {
      if (field.required) throw new Error(`Required JSON form field: ${field.key}`);
      continue;
    }

    if (field.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value) || (field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max)) throw new Error(`Invalid JSON form field: ${field.key}`);
      continue;
    }
    if (field.type === "switch") {
      if (typeof value !== "boolean") throw new Error(`Invalid JSON form field: ${field.key}`);
      continue;
    }
    if (field.type === "multi_select") {
      const allowed = new Set(field.options?.map((option) => option.value) ?? []);
      if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !allowed.has(item))) throw new Error(`Invalid JSON form field: ${field.key}`);
      continue;
    }
    if (typeof value !== "string") throw new Error(`Invalid JSON form field: ${field.key}`);
    if (field.type === "select" && !field.options?.some((option) => option.value === value)) throw new Error(`Invalid JSON form field: ${field.key}`);
    if (field.type === "email" && !/^\S+@\S+\.\S+$/.test(value)) throw new Error(`Invalid JSON form field: ${field.key}`);
    if (field.type === "url") {
      try {
        const url = new URL(value);
        if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
      } catch {
        throw new Error(`Invalid JSON form field: ${field.key}`);
      }
    }
  }
  return values;
}

export function mergeJsonFormValues(
  fields: readonly JsonFormFieldDefinition[],
  submitted: Record<string, unknown>,
  existing: Record<string, unknown> = {},
) {
  const definitions = new Map(fields.map((field) => [field.key, field]));
  const result: Record<string, unknown> = {};

  for (const field of fields) {
    if (field.secret && existing[field.key] !== undefined) result[field.key] = existing[field.key];
  }

  for (const [key, value] of Object.entries(submitted)) {
    const field = definitions.get(key);
    if (!field) throw new Error(`Unknown JSON form field: ${key}`);
    if (!field.secret) {
      result[key] = value;
      continue;
    }
    if (value === null) {
      delete result[key];
      continue;
    }
    if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid secret field: ${key}`);
    result[key] = value;
  }

  return result;
}

export function buildJsonFormSubmission(
  fields: readonly JsonFormFieldDefinition[],
  values: JsonFormValues,
  clearedSecrets: readonly string[] = [],
) {
  const submitted: JsonFormSubmitValues = { ...values };
  const cleared = new Set(clearedSecrets);

  for (const field of fields) {
    if (!field.secret) continue;
    if (cleared.has(field.key)) {
      submitted[field.key] = null;
      continue;
    }
    const value = submitted[field.key];
    if (typeof value !== "string" || !value.trim()) delete submitted[field.key];
  }

  return submitted;
}

export function redactJsonFormValues(fields: readonly JsonFormFieldDefinition[], stored: Record<string, unknown>) {
  const values: Record<string, unknown> = {};
  const configuredSecrets: string[] = [];

  for (const field of fields) {
    const value = stored[field.key];
    if (field.secret) {
      if (typeof value === "string" && value.length > 0) configuredSecrets.push(field.key);
    } else if (value !== undefined) {
      values[field.key] = value;
    }
  }

  return { values, configuredSecrets };
}
