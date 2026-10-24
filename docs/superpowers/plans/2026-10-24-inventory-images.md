# 库存图片与对齐 Implementation Plan

**Goal:** 库存列表展示原表商品缩略图、修正标签对齐，解释历史快照。

**Architecture:** 独立InventoryThumbnail组件处理图片状态；共享来源常量生成CSP图片白名单。库存CSS覆盖全局表格对齐，现有API和数据库保持不变。

**Tech Stack:** React19、Node24、CSS、node:test、esbuild、浏览器验收。

- [x] 检查当前样式及实际图片来源；先用浏览器/用户截图确认错位，核实快照写入是新增。
- [x] 在tests/inventory-ui.test.mjs增加真实组件渲染的来源、占位、懒加载与Referrer测试；在HTTP测试检查CSP只开放所需图片来源，先观察失败。
- [x] 添加src/inventory-images.mjs来源常量、src/components/InventoryThumbnail.jsx组件，接入src/pages/Inventory.jsx图片列。固定52px缩略图，错误显示加载失败，不循环重试。
- [x] 在src/inventory.css明确th/td左对齐及标签列宽度，补充每日导入与历史保留说明。
- [x] 运行库存相关测试及生产构建，在3002独立内存环境核对真实图片、标签布局、缺图和失败占位；停止专用进程。
- [x] 更新README和验收记录，运行完整检查，提交推送现有GitHub分支，不提交真实数据或截图。
