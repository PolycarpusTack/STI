export function getIsoWeek(date: Date): { isoYear: number; isoWeek: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const isoWeek = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { isoYear: d.getUTCFullYear(), isoWeek };
}

export function isoWeekToDateRange(
  isoYear: number,
  isoWeek: number
): { monday: Date; friday: Date } {
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const monday = new Date(Date.UTC(isoYear, 0, 4 - dayOfWeek + 1 + (isoWeek - 1) * 7));
  const friday = new Date(monday);
  friday.setUTCDate(friday.getUTCDate() + 4);
  return { monday, friday };
}

export function formatWeekRange(isoYear: number, isoWeek: number): string {
  const { monday, friday } = isoWeekToDateRange(isoYear, isoWeek);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  return `${monday.toLocaleDateString("en-GB", opts)} – ${friday.toLocaleDateString("en-GB", opts)}`;
}
