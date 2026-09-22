// Meta's Cloud API gives us phone numbers as bare digits (e.g.
// "593993908744", no "+") — that's what phoneNumber is everywhere else in
// this app (Redis keys, logging). Core API's own validators require the
// leading "+", so it's added only at that boundary, not propagated back.
export function toE164(phoneNumber: string): string {
  return phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
}
