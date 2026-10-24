import React, { useState } from "react";
import { ImageOff } from "lucide-react";
import { inventoryThumbnailUrl } from "../inventory-images.mjs";

export default function InventoryThumbnail({ item }) {
  const url = inventoryThumbnailUrl(item.imageUrl);
  const [failedUrl, setFailedUrl] = useState(null);
  const name = item.name || item.sku || "商品";
  const failed = url && failedUrl === url;
  if (!url || failed) {
    const message = failed ? "加载失败" : "暂无图片";
    return (
      <span
        className="inv-thumbnail inv-thumbnail-empty"
        role="img"
        aria-label={`${name}：${message}`}
        title={
          failed
            ? "原图暂时无法加载，可在详情中打开原图"
            : "原表未提供可展示的图片"
        }
      >
        <ImageOff size={17} aria-hidden="true" />
        <span>{message}</span>
      </span>
    );
  }
  return (
    <a
      className="inv-thumbnail"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`查看 ${item.sku || name} 商品原图`}
      title="打开商品原图"
    >
      <img
        src={url}
        alt={name}
        width="52"
        height="52"
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailedUrl(url)}
      />
    </a>
  );
}
