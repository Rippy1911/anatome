export function formatCents(cents) {
  if (!cents) return "$0";
  const v = cents / 100;
  return "$" + (v % 1 === 0 ? String(v) : v.toFixed(2));
}

export function formatNum(n) {
  if (!n) return "0";
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(Math.round(n));
}

export function formatOverage(cents) {
  if (!cents) return "—";
  return "$" + (cents * 10).toFixed(2) + "/1K";
}

export function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}