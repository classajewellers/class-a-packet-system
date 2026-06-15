const SA_PUBLIC_HOLIDAYS: string[] = [
  // 2025
  "2025-01-01",
  "2025-01-27",
  "2025-04-18",
  "2025-04-19",
  "2025-04-21",
  "2025-04-25",
  "2025-06-09",
  "2025-10-06",
  "2025-11-04",
  "2025-12-25",
  "2025-12-26",
  // 2026
  "2026-01-01",
  "2026-01-26",
  "2026-04-03",
  "2026-04-04",
  "2026-04-06",
  "2026-04-25",
  "2026-06-08",
  "2026-10-05",
  "2026-11-03",
  "2026-12-25",
  "2026-12-26",
];

const HOLIDAY_SET: Set<string> = new Set(SA_PUBLIC_HOLIDAYS);

function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isBusinessDay(d: Date): boolean {
  if (d.getDay() === 0) return false;
  if (HOLIDAY_SET.has(toDateString(d))) return false;
  return true;
}

export function BUSINESS_DAYS_NEEDED(
  orderType: string,
  jobComplexity?: string,
  manufactureType?: string
): number {
  const type = orderType.toLowerCase();

  if (type.includes("repair")) {
    if (jobComplexity === "Complex") return 10;
    return 5;
  }

  if (type.includes("custom_order") || type.includes("manufacture")) {
    if (manufactureType === "Fully Finished") return 42;
    if (manufactureType === "Set Only") return 21;
    if (manufactureType === "Raw Cast") return 21;
    if (manufactureType === "FF Assembly") return 14;
    if (manufactureType === "Fully Polished") return 14;
  }

  return 7;
}

export function calculateWorkshopDueDate(
  dateTaken: Date,
  orderType: string,
  jobComplexity?: string,
  manufactureType?: string
): Date {
  const businessDaysNeeded = BUSINESS_DAYS_NEEDED(
    orderType,
    jobComplexity,
    manufactureType
  );

  let current = new Date(dateTaken);
  current.setHours(0, 0, 0, 0);

  let daysAdded = 0;

  while (daysAdded < businessDaysNeeded) {
    current.setDate(current.getDate() + 1);
    if (isBusinessDay(current)) {
      daysAdded++;
    }
  }

  return current;
}
