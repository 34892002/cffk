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
  /** Renders and validates this field only while the referenced field holds one of these values. */
  visibleWhen?: { key: string; in: string[] };
};
export type JsonFormDefinition = {
  provider: string;
  schemaVersion: number;
  title: string;
  fields: JsonFormFieldDefinition[];
  defaults: JsonFormValues;
};

export function isJsonFormEmail(value: string) {
  return /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/.test(value);
}

export function normalizeJsonFormInputValue(type: string, value: unknown): JsonFormInputValue {
  if (type !== "number") return typeof value === "string" ? value : "";
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  if (typeof value !== "string" || !value.trim()) return "";
  const number = Number(value);
  return Number.isFinite(number) ? number : "";
}

type JsonFormValidationIssue = "required" | "invalid";

export function isJsonFormFieldVisible(field: JsonFormFieldDefinition, values: Record<string, unknown>) {
  const rule = field.visibleWhen;
  if (!rule) return true;
  const value = values[rule.key];
  return typeof value === "string" && rule.in.includes(value);
}

export function visibleJsonFormFields(fields: readonly JsonFormFieldDefinition[], values: Record<string, unknown>) {
  return fields.filter((field) => isJsonFormFieldVisible(field, values));
}

function jsonFormValidationIssue(field: JsonFormFieldDefinition, value: unknown, configuredSecret = false): JsonFormValidationIssue | null {
  const missing = value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
  if (missing) return field.required && !(field.secret && configuredSecret && value !== null) ? "required" : null;
  if (field.type === "number") return typeof value !== "number" || !Number.isFinite(value) || (field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max) ? "invalid" : null;
  if (field.type === "switch") return typeof value !== "boolean" ? "invalid" : null;
  if (field.type === "multi_select") {
    const allowed = new Set(field.options?.map((option) => option.value) ?? []);
    return !Array.isArray(value) || value.some((item) => typeof item !== "string" || !allowed.has(item)) ? "invalid" : null;
  }
  if (typeof value !== "string") return "invalid";
  if (field.type === "select" && !field.options?.some((option) => option.value === value)) return "invalid";
  if (field.type === "email" && !isJsonFormEmail(value)) return "invalid";
  if (field.type === "url") {
    if ((field.key === "notifyUrl" || field.key === "returnUrl") && value.startsWith("/")) return null;
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") return "invalid";
    } catch {
      return "invalid";
    }
  }
  return null;
}

export function getJsonFormErrors(fields: readonly JsonFormFieldDefinition[], values: Record<string, unknown>, configuredSecrets: readonly string[] = []) {
  const configured = new Set(configuredSecrets);
  const errors: Record<string, string> = {};
  for (const field of visibleJsonFormFields(fields, values)) {
    const issue = jsonFormValidationIssue(field, values[field.key], configured.has(field.key));
    if (issue === "required") errors[field.key] = `请填写${field.label}。`;
    else if (issue === "invalid") errors[field.key] = `${field.label}格式无效。`;
  }
  return errors;
}

export function validateJsonFormValues(fields: readonly JsonFormFieldDefinition[], values: Record<string, unknown>) {
  for (const field of visibleJsonFormFields(fields, values)) {
    const issue = jsonFormValidationIssue(field, values[field.key]);
    if (issue === "required") throw new Error(`Required JSON form field: ${field.key}`);
    if (issue === "invalid") throw new Error(`Invalid JSON form field: ${field.key}`);
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

  // A field that the submitted values no longer reveal (for example RSA keys after
  // switching back to MD5) must not stay in the stored configuration. Legacy
  // payloads without the controlling field keep their existing values.
  for (const field of fields) {
    const rule = field.visibleWhen;
    if (!rule || !(rule.key in result)) continue;
    if (!isJsonFormFieldVisible(field, result)) delete result[field.key];
  }

  return result;
}

export function buildJsonFormSubmission(
  fields: readonly JsonFormFieldDefinition[],
  values: JsonFormValues,
  clearedSecrets: readonly string[] = [],
) {
  const submitted: JsonFormSubmitValues = {};
  const cleared = new Set(clearedSecrets);

  for (const field of visibleJsonFormFields(fields, values)) {
    if (!field.secret) {
      if (Object.hasOwn(values, field.key)) submitted[field.key] = values[field.key] ?? "";
      continue;
    }
    if (cleared.has(field.key)) {
      submitted[field.key] = null;
      continue;
    }
    const value = values[field.key];
    if (typeof value !== "string" || !value.trim()) continue;
    submitted[field.key] = value;
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
