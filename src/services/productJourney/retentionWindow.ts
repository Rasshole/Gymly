export type RetentionWindow = {
  d1Due: boolean;
  d7Due: boolean;
  d1Returned: boolean | null;
  d7Returned: boolean | null;
};

function parseDay(day: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) {
    throw new Error(`Invalid activity date: ${day}`);
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function formatDay(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addCalendarDays(day: string, days: number): string {
  const date = parseDay(day);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDay(date);
}

/**
 * D1 and D7 are measured from the first activity date.
 * A same-day session is not a return. Null means that calendar day has not arrived.
 */
export function retentionWindowStatus(
  firstActivityDate: string,
  activityDates: string[],
  today: string,
): RetentionWindow {
  const days = new Set(activityDates);
  const d1 = addCalendarDays(firstActivityDate, 1);
  const d7 = addCalendarDays(firstActivityDate, 7);
  const d1Due = today >= d1;
  const d7Due = today >= d7;
  return {
    d1Due,
    d7Due,
    d1Returned: d1Due ? days.has(d1) : null,
    d7Returned: d7Due ? days.has(d7) : null,
  };
}
