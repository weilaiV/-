# 库存经营 Implementation Plan

**Goal:** 将用户Excel库存快照真实导入本地网站，提供查询、预警和后续导入。

**Architecture:** React库存页调用同源Node API；SQLite新增快照/商品表，现有账号权限不变；成熟Excel库在服务端读取实际单元格。用户原文件与真实数据只保留本地。

**Tech Stack:** Node24、React19、SQLite、read-excel-file、node:test。

- [x] 合成数据测试先失败，覆盖解析、精度、空白和快照隔离。
- [x] 库存领域、Excel读取、事务导入、查询和HTTP权限。
- [x] 库存页、详情、筛选排序、预检与确认导入，接入供应链目录。
- [x] 正式库一致性备份；使用CLI导入授权真实文件，校对独立控制数。
- [x] 自动检查、独立审查和本地浏览器验收；仅合成截图可入仓库。
- [x] GitHub同步代码与通用文档；停止专用测试进程，保留用户自己运行的网站。
