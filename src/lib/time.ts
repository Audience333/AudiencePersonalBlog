import { Temporal } from '@js-temporal/polyfill';

export function parseZonedDateTime(value: string, timezone: string): number | undefined {
  try {
    return Temporal.PlainDateTime.from(value).toZonedDateTime(timezone).toInstant().epochMilliseconds;
  } catch (error) {
    if (error instanceof RangeError) return undefined;
    throw error;
  }
}

export function formatZonedDateTime(timestamp: number, timezone: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(timestamp));
}
