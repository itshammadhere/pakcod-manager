export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let cleaned = phone.replace(/[\s\-\(\)]/g, "");
  if (cleaned.startsWith("+92")) cleaned = "0" + cleaned.slice(3);
  else if (cleaned.startsWith("92")) cleaned = "0" + cleaned.slice(2);
  else if (cleaned.startsWith("0092")) cleaned = "0" + cleaned.slice(4);
  if (/^03\d{9}$/.test(cleaned)) return cleaned;
  if (/^3\d{9}$/.test(cleaned)) return "0" + cleaned;
  return null;
}

export function isValidPakistanPhone(phone: string | null | undefined): boolean {
  return normalizePhone(phone) !== null;
}

export function formatPhone(phone: string | null | undefined): string {
  const n = normalizePhone(phone);
  if (!n) return phone || "—";
  return `${n.slice(0, 4)}-${n.slice(4, 7)}-${n.slice(7)}`;
}
