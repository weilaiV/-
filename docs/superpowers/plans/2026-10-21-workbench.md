# 经营工作台 Implementation Plan

> **For agentic workers:** Execute inline using superpowers:executing-plans. Use checkbox steps for tracking.

**Goal:** 交付本地可运行、真实持久化、可通过 GitHub 持续维护的内部经营工作台。

**Architecture:** React 单页应用调用同源 Node API。SQLite 保存账号、会话、导入批次和经营明细；金额以分存储；服务端承担权限与核算。

**Tech Stack:** Node 24、SQLite、React 19、Vite 7、csv-parse、node:test。

---

## Task 1: 版本与测试基线

- [ ] 创建 package.json、忽略数据库与密钥、设计文档与测试。
- [ ] `npm install`；`npm test` 确认新功能缺失导致失败。

## Task 2: 核算和导入领域层

Files: server/domain.mjs, tests/domain.test.mjs

- [ ] 测试金额 0.10+0.20=30 分、真实日期、退款限制、精确利润、等长环比。
- [ ] 导出 validateRows、parseCsv、summarize，采用明确中文错误提示。
- [ ] `node --test tests/domain.test.mjs` 通过。

## Task 3: 数据与认证 API

Files: server/db.mjs, server/security.mjs, server/app.mjs, server/index.mjs, tests/api.test.mjs

- [ ] 先写 HTTP 黑盒测试：创建管理员、认证保护、CSV 整批回滚、重复拒绝、只读禁止写、退出失效。
- [ ] 实现 SQLite 迁移、自然键唯一、密码哈希与 token 哈希、角色中间件、Origin 检查、限流。
- [ ] 实现 status/setup/login/logout/me、overview、records、imports/preview、imports、users、demo API。
- [ ] `npm test` 和 `npm run check` 通过。

## Task 4: 交互界面

Files: src/main.jsx, src/api.js, src/styles.css, src/components/_, src/pages/_

- [ ] 以浅色管理界面、深色侧栏、金色强调建立响应式布局。
- [ ] 实现初始化/登录、可联动筛选的指标/趋势/店铺排名、交易分页、CSV 文件预检提交、批次历史、账号管理。
- [ ] 所有请求有加载、失败、空数据反馈；演示数据常驻标识。
- [ ] `npm run build`，启动开发服务，在浏览器进行真实操作验收。

## Task 5: 运维与交付

Files: Dockerfile, compose.yaml, .github/workflows/ci.yml, README.md

- [ ] 补充本地启动、口径、CSV 模板、测试、部署和 SQLite 在线备份说明。
- [ ] 新鲜执行 `npm test`、`npm run check`、`npm run build`。
- [ ] Git 提交并推送用户提供的仓库开发分支；同步默认分支前确认远端无内容。
