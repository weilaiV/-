import { safeImageUrl } from "./inventory-ui.mjs";

// Public image origins used by the supported ERP export; shared with CSP.
export const INVENTORY_IMAGE_ORIGINS = Object.freeze([
  "https://img.alicdn.com",
  "https://cbu01.alicdn.com",
  "https://img.pddpic.com",
  "https://images.sursung.com",
  "https://images-erp.sursung.com",
]);

export function inventoryThumbnailUrl(value) {
  const url = safeImageUrl(value);
  return url && INVENTORY_IMAGE_ORIGINS.includes(new URL(url).origin)
    ? url
    : null;
}
