import { inject, ref, type InjectionKey, type Ref } from "vue";

export const DEFAULT_SITE_TIMEZONE = "Asia/Shanghai";
export const SITE_TIMEZONE_KEY: InjectionKey<Ref<string>> = Symbol("site-timezone");

export function useSiteTimezone() {
  return inject(SITE_TIMEZONE_KEY, ref(DEFAULT_SITE_TIMEZONE));
}

export const SITE_TIMEZONES = [...new Set(["UTC", ...Intl.supportedValuesOf("timeZone").filter((timezone) => !timezone.startsWith("Etc/"))])] as const;

export function normalizeSiteTimezone(value: string) {
  const timezone = value.trim();
  if (timezone !== "UTC" && (timezone.startsWith("Etc/") || !timezone.includes("/"))) throw new Error("SITE_TIMEZONE_INVALID");
  new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  return timezone;
}

export function formatDateInTimezone(value: Date | string | number, timezone: string, options: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" }) {
  return new Intl.DateTimeFormat("zh-CN", { ...options, timeZone: timezone }).format(new Date(value));
}

function timezoneOffsetMs(date: Date, timezone: string) {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "longOffset" })
    .formatToParts(date)
    .find((item) => item.type === "timeZoneName")?.value;
  if (!part || part === "GMT") return 0;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(part);
  if (!match) throw new Error("SITE_TIMEZONE_INVALID");
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return (match[1] === "+" ? minutes : -minutes) * 60_000;
}

function dateFromTimezoneParts(year: number, month: number, day: number, hour: number, minute: number, timezone: string) {
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const initialOffset = timezoneOffsetMs(new Date(localAsUtc), timezone);
  let result = new Date(localAsUtc - initialOffset);
  const correctedOffset = timezoneOffsetMs(result, timezone);
  if (correctedOffset !== initialOffset) result = new Date(localAsUtc - correctedOffset);
  return result;
}

export function startOfDayInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return dateFromTimezoneParts(Number(values.year), Number(values.month), Number(values.day), 0, 0, timezone);
}

export function dateBoundaryInTimezone(value: string, timezone: string, nextDay = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("CARD_DATE_INVALID");
  const [year, month, day] = value.split("-").map(Number);
  return dateFromTimezoneParts(year!, month!, day! + (nextDay ? 1 : 0), 0, 0, timezone);
}

export function dateTimeInTimezone(value: string, timezone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("SITE_DATETIME_INVALID");
  const [, year, month, day, hour, minute] = match;
  return dateFromTimezoneParts(Number(year), Number(month), Number(day), Number(hour), Number(minute), timezone);
}

export function formatDateTimeInputInTimezone(value: Date | string | number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}
