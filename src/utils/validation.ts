export const MAX_WHOLE_NAIRA = 1_000_000_000_000;

export function isValidWholeNaira(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_WHOLE_NAIRA;
}

export function normalizeWholeNaira(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return isValidWholeNaira(rounded) ? rounded : null;
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
