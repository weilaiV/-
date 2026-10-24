# 原站公开前端静态目录

本文件配套 `reference-inventory.json`，用于分模块还原和本地页面目录。静态候选不等于已验证页面，也不代表页面已还原或对应功能可用。所有业务候选入口初始状态为 `pending`；页面目录应禁用入口并显示“待还原”，通过逐页验收后再启用。

## 范围与读取方式

本次只把已下载的原站公开前端脚本当作文本读取，没有执行原站代码、bundle bootstrap 或页面初始化，没有调用原站业务接口。结构化目录恢复自 `reference-user.js` 的惰性 AST：

- `Ab`：11 个模块的标识、标题、说明、一级分区。
- `jb`：35 条路由/标题/名称的分类匹配规则。
- `xT`：12 个产品中心与规划页面的静态注册定义。
- `TT`：老板、个人、快捷、管理、配置工作台注册，以及部门模板生成规则。
- `MS`：销售、运营、供应链、财务、客服售后、课程交付 6 个部门模板。
- 显式父子路由：智能分析、个人中心等。
- `KS`/`VS`：视觉工作台的公开外链定义。

`reference-user.js` 的 SHA-256 为 `f8601af6a436c93b24ac6531e5a80fa243e486af72821eba436d479b71cf4b07`。公开脚本还声明通过 `/system/menu/getRouters` 获取动态菜单，说明该脚本本身不能提供全部实际路由。未下载其业务响应，因此这里不是完整的运行时菜单快照。

目录共有 **11 个模块、69 个静态候选条目、59 个路径值**。其中 13 个条目只有标题或分类线索；其余条目的路径值可能是明确注册路径、菜单匹配片段或外链。候选条目中还包含分类占位、标题待去重和辅助个人入口，**69 不能解释为已确认的独立页面数量**。

## 目录使用约定

- JSON 的 `groups` 是页面目录的数据源，每组包含 `id/title/description/section/entries`。
- 每个 `entries` 条目包含 `title/section/paths/status`；当前全部为 `pending`。
- `/` 开头的路径来自显式路由或纯静态拼接；未经过运行时可达性验证。
- 不带 `/` 的路径是原脚本的菜单匹配片段，例如 `erphesaun`，不能据此补造父级路径。尤其保留 `qiankaun`、`lianjieshujv` 等原始拼写，以免误改匹配规则。
- `paths: []` 表示未恢复可靠路径，不是页面无路由。
- `titleMatches` 保留匹配名称。多个名称不证明有多个页面，也不证明这些名称对应的路径互为别名。
- 第一批的老板工作台也保持 `pending`。本目录不代替实现代理的验收结果；验收后应单独更新已完成状态。
- 未实现条目应禁用并显示“待还原”。静态候选、空白页、模拟跳转和“建设中”文案不能计为已完成的功能。

## 11 模块还原清单

| 模块 | 一级分区 | 候选条目 | 无可靠路径 | 可恢复范围 |
| --- | --- | ---: | ---: | --- |
| 工作台 `workbench` | 个人工作 | 13 | 0 | 首页、老板、6 个部门、个人、快捷、管理、配置、个人中心 |
| 经营财务 `finance` | 业务经营 | 8 | 1 | 公司总览、核算、费用、资产、账户、欠款、战略项目与预测；财务报表分类线索 |
| 产品中心 `product` | 业务经营 | 6 | 0 | 经营总览、档案、利润结构、选品规划、研发新品、生命周期 |
| 运营增长 `operations` | 业务经营 | 7 | 1 | 店铺经营/资料/目标、链接经营/资料、推广计划、达摩盘排行 |
| 销售客户 `customer` | 业务经营 | 10 | 0 | 经营诊断、客户资产/机会、微信转化、品牌标准、接待、服务质量、天猫体验分、退货、销售协同 |
| 供应链 `supply` | 业务经营 | 3 | 0 | 库存经营、采购分析、供应商经营 |
| 组织人效 `talent` | 业务经营 | 5 | 2 | 人员业绩/目标、部门、岗位、人才培养 |
| 协同中心 `collaboration` | 管理与支持 | 3 | 1 | 通知中心、通知公告、经营复盘 |
| 知识与 AI `dataAI` | 管理与支持 | 4 | 0 | 经营知识库、分析模板、AI 会话、Codex 对话 |
| 视觉工作台 `visualWorkbench` | 管理与支持 | 1 | 0 | 独立外链入口；创作应用内部界面未恢复 |
| 系统管理 `system` | 管理与支持 | 9 | 8 | RPA账号、文件/对象存储、字典/参数、用户/角色/菜单/客户端 |

### 工作台

明确路径：`/index`、`/workspace/owner`、`/workspace/personal`、`/workspace/quick`、`/workspace/manage`、`/workspace/settings`。个人中心的父子路由静态拼接为 `/user/profile`，为本地目录归入个人工作。

部门模板候选路径为 `/workspace/departments/{id}`，静态 `id` 为 `sales`、`operations`、`supply`、`finance`、`service`、`course`。这些来自模板注册规则，不表示真实组织已经绑定这些部门，也不证明所有用户都能看见入口。

`CompanyWorkspace.js` 是引用 `OwnerDashboard.js` 的包装组件，因此第一批的老板工作台路径为 `/workspace/owner`，工作台首页 `/index` 保持独立记录。

### 经营财务

菜单片段：`shujufenxi`、`erphesaun`、`expense`、`zichanzonglan`、`zhanghuzichan`、`qiankuanxiangqing` / `qiankaun`。明确注册规划路径：`/planning/strategy`。

“财务管理报表”目前只有分类元数据，独立列出便于补证，不能计作已确认页面。“账户资产/账户余额/天猫资产”等标题来自同一条分类规则，暂为一个待验证候选。

### 产品中心

6 个明确注册路径：`/product-center/overview`、`/product-center/catalog`、`/product-center/profit`、`/product-center/selection`、`/product-center/development`、`/product-center/lifecycle`。它们提供场景名称和导航定义，未证明各场景已有完整业务功能。

### 运营增长

菜单片段：`dianpushuju`、`dianpuguanli`、`dianpumubiao`、`lianjieshujv` / `lianjieshuju`、`lianjieguanli`、`dmp`。`OnlineShopData` 的静态补充路由也只保留了相对片段，父级仍未知。

“推广计划管理”恢复到 `OperationPromotionPlans` 的名称及元数据，源对象的路径为空，需结合实际菜单补证。

### 销售客户

菜单片段：`jingyingzhenduan`、`kehujihui`、`wechat`、`xianshangjiedai`、`fuwuzhiliang`、`tianmaotiyanjifen` / `tianmaodianpupingtai`、`tuihuofenxi`、`xiaoshouxietong`。

明确规划路径：`/planning/customerAssets`、`/planning/brandService`。“天猫体验分”和“天猫店铺平台”当前归于同一规则候选，二者实际页面关系未确认。

### 供应链

菜单片段：`kucunliuzhuan`、`caigoufenxi`、`gongyinglianjingying`。已恢复库存流转、采购经营分析、供应链经营的匹配名称与部分路由名；不能据此假定所有采购、库存、供应商管理子页已经枚举。

### 组织人效

菜单片段：`renyuanyeji`、`renyuanmubiao`。人才培养有明确规划路径 `/planning/talentDevelopment`。“部门管理”和“岗位管理”只从标题匹配规则恢复，没有可靠路径。

### 协同中心

通知中心片段为 `tongzhizhongxin`；经营复盘明确路径为 `/planning/businessReview`；通知公告只有标题候选。模块说明中出现任务协作、业务审批，分类排序还出现流程配置，但没有足够静态页面定义，未凭说明虚构入口或路径。

### 知识与 AI

明确路径：`/planning/knowledge`、`/intelligent-analysis/templates`、`/intelligent-analysis/chat`。`aichat` 是另一个菜单匹配片段。尽管规则将“AI会话 / AI 会话 / Codex 对话”列为匹配标题，尚不能确认该片段与显式 Codex 对话路由是同一页面，暂分别保留并说明不确定性。

### 视觉工作台

公开外链为 `https://wxhb.aikeran.com/`。原脚本包含新窗口与登录衔接逻辑，目录只记录公开目标，不收录账号、凭据、认证参数或实际登录行为。本阶段没有该应用内部画布、素材、创作及导出功能的页面证据。

### 系统管理

RPA账号管理的匹配片段为 `rpaaccountmanagement`。其余仅恢复到标题：文件管理、OSS对象存储/对象存储、字典管理、参数设置、用户管理、角色管理、菜单管理、客户端管理。对象存储的两种标题暂合并；各页面完整路径、功能范围及权限关系均待验证。

## 辅助路由

结构化 JSON 另列 10 个 `auxiliaryRoutes`：登录、注册、登录回调、401、兜底、重定向辅助路由，以及智能分析和工作台的重定向。它们不额外计入上述 69 个模块候选条目。

已恢复的工作台兼容跳转：`/workspace/access` → `/workspace/settings`；`/workspace/manager` → `/index`；`/workspace/boards` → `/index`。静态注册中标为隐藏，不能当作额外业务页面。

## 分期路线

| 批次 | 范围 | 当前状态 | 该批交付门槛 |
| --- | --- | --- | --- |
| 1 | shell、login、ownerDashboard | pending | 应用框架、11 模块目录、登录及老板工作台；其余入口禁用并显示待还原 |
| 2 | 工作台体系、产品中心 | pending | 逐个确认部门/个人/快捷工作台和配置边界，完成产品 6 场景 |
| 3 | 经营财务 | pending | 补全菜单父路径与字段口径，分资产、核算、费用、欠款、规划验收 |
| 4 | 运营增长、销售客户、供应链 | pending | 按店铺、链接、客户、服务、库存、采购、供应商分子批交付 |
| 5 | 组织人效、协同中心、知识与 AI | pending | 补证标题候选与路由，完成目标绩效、通知复盘、知识模板和会话 |
| 6 | 视觉工作台、系统管理 | pending | 确认外部视觉应用的还原范围，补证权限、字典、文件和数据管理页面 |

每批先确认页面及实际交互，再实现本地功能并验收。对每页记录实际存在的筛选、排序、分页、日期范围、详情、导入导出，以及加载、空态、错误与权限状态。未观察到的行为保留未知。使用本地模拟或本地持久化数据；功能验收不依赖原站凭据或原站业务数据。

## REA 证据摘要

- 官方工具包：`rea-agents@6.7.0`。
- 分析器：`rea-javascript-application`，provider version `1`。
- 操作：`analyze_javascript_application`。
- Evidence ID：`ev_01daffa02cc8643f0c0f7fba048e127a886ea0dfc966739abc86aa6fe40ebb17`。
- 实际语义分析源：`OwnerDashboard.js`、`CompanyWorkspace.js`、`login.js`。
- `user.js` 位于文件清单中，但未纳入该次选定源的语义分析。上述导航目录另由 REA 本地依赖 `@babel/parser` 作惰性 AST 解析得到，不能描述成该 REA 证据已分析全部导航源。
- 分析限制：图覆盖不完整；动态表达式、外部依赖和未选择源之间的关系可能未知；静态导入、端点、路由及关系不证明运行或行为等价。

本仓库文档只保存该摘要。不提交原始压缩脚本、完整证据 JSON、原站业务数据、账号或私有截图。
