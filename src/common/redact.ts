/** Masks all but the last `visible` characters, for logging identifiers that shouldn't appear in full (phone numbers, tokens, message IDs). */
export function maskTail(value: string, visible = 4): string {
  if (value.length <= visible) {
    return '*'.repeat(value.length);
  }
  return '*'.repeat(value.length - visible) + value.slice(-visible);
}
