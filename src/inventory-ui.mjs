export function formatQuantity(value) {
  return value === null || value === undefined || value === ""
    ? "未提供"
    : typeof value === "number"
      ? new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 6 }).format(
          value,
        )
      : String(value);
}

export function formatImportedAt(value) {
  if (!value) return "未提供";
  const source = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? value.replace(" ", "T") + "Z"
    : value;
  const date = new Date(source);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })
    : String(value);
}

export function inventoryQuery(filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== null && value !== undefined && String(value).trim() !== "")
      params.set(key, String(value).trim());
  }
  return `?${params}`;
}

export function validInventoryDate(value) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < "2000-01-01" ||
    value > "2100-12-31"
  )
    return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function safeImageUrl(value) {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value.trim()))
    return null;
  try {
    const url = new URL(value.trim());
    if (url.username || url.password) return null;
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const parts = [];
  for (let offset = 0; offset < bytes.length; offset += 16384)
    parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 16384)));
  return btoa(parts.join(""));
}
