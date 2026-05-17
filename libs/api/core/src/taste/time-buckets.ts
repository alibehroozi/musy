import type { MonthValue, TimeOfDayValue, WeekdayValue } from "@moc/contracts";

// LOGIC-29: getDay() returns 0=Sun..6=Sat. Index Sunday last so the
// weekly enum reads Mon..Sun left-to-right (matching the product spec).
const WEEKDAYS: readonly WeekdayValue[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const MONTHS: readonly MonthValue[] = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

export function bucketWeekday(date: Date): WeekdayValue {
  return WEEKDAYS[date.getDay()]!;
}

export function bucketMonth(date: Date): MonthValue {
  return MONTHS[date.getMonth()]!;
}

// LOGIC-29: boundary hours map to the slot they START. 06:00 → morning,
// 12:00 → afternoon, 18:00 → evening, 00:00 → night.
export function bucketTimeOfDay(date: Date): TimeOfDayValue {
  const hour = date.getHours();
  if (hour < 6) return "night";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}
