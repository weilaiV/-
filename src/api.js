export async function api(path, body) {
  const response = await fetch("/api" + path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || "请求失败，请稍后重试");
    error.status = response.status;
    throw error;
  }
  return result;
}
export const money = (cents, decimals = 0) =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format((cents || 0) / 100);
export const percent = (value) => `${(value || 0).toFixed(2)}%`;
export const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(
    new Date(),
  );
export const shiftDay = (date, days) =>
  new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);
export const query = (filters) => "?" + new URLSearchParams(filters).toString();
