// Drops null/undefined keys entirely rather than sending them as `null` —
// the final invoice contract only includes fields we actually have data for.
export function omitEmpty<T extends Record<string, unknown>>(
  obj: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(
      ([, value]) => value !== null && value !== undefined,
    ),
  ) as Partial<T>;
}
