export function amountToCents(value) {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  if (!/^-?\d+(?:\.\d{0,2})?$/.test(text)) return null;
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace(/^-/, "").split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(negative ? -cents : cents);
}

export function centsToInput(value) {
  const cents = BigInt(value || 0);
  const absolute = cents < 0n ? -cents : cents;
  return `${cents < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

export function expenseTotal(amounts) {
  let total = 0n;
  for (const value of Object.values(amounts)) {
    const cents = amountToCents(value);
    if (cents === null) return null;
    total += BigInt(cents);
  }
  return total > BigInt(Number.MAX_SAFE_INTEGER) ||
    total < -BigInt(Number.MAX_SAFE_INTEGER)
    ? null
    : Number(total);
}

export function validMonth(value) {
  return (
    /^\d{4}-(0[1-9]|1[0-2])$/.test(value) &&
    value >= "2000-01" &&
    value <= "2100-12"
  );
}
