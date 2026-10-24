# 库存模块内部接口

数量字段按本ERP的整数数量保存；可售天数保留小数和负数。无值为null。字段定义见src/inventory-schema.mjs；领域函数见server/inventory-domain.mjs。

## 数据结构

item有id(入库生成)、rowNumber、imageUrl、styleCode、sku、name、variant、color、spec、tagText、tags数组、stock、daysCover、procurementFlag、suggestedPurchase、minStock、maxStock、minDays、maxDays、pendingShip、returnStock、transferInTransit、returnInTransit、virtualStock、syncStatus、sales1、sales7、sales15、returns1、returns7、returns15、updatedAt(原表文本)、preorder3/5/7/10/15/20/25/30/45。flags为inventoryFlags(item)结果。

inventoryFlags输出below-min、above-max、suggested、negative-stock、negative-days、invalid-limits、source-slow、source-clearance、source-delisted；一个item可有多项。anomaly是negative-stock/negative-days/invalid-limits的并集，missing-sales是sales7===null。

summarizeInventory(items)输出skuCount、styleCount、stockTotal、belowMinCount、aboveMaxCount、anomalyCount、missingSalesCount、slowTagCount、delistedCount，以及pendingShip/sales7/suggestedPurchase三个对象{value:有值之和或全缺时null,provided,total}。

snapshot为{id,filename,sheetName,asOfDate,importedAt,rowCount,sourceHash}。

## API

- GET /api/inventory?snapshotId=&search=&style=&tag=&status=&sort=stock&direction=desc&page=1。status允许all/below-min/above-max/suggested/anomaly/missing-sales/source-slow/source-clearance/source-delisted。sort允许stock/daysCover/sales7/suggestedPurchase/sku/name/updatedAt，null始终排最后。返回{snapshot,snapshots,items,total,page,pageSize:30,summary,overallSummary,options:{styles,tags},topStyles:[{name,skuCount,stockTotal}],warnings}。没有快照时snapshot:null,其余空数组及空summary。search匹配编码名称规格款式，style/tag精确匹配；summary/topStyles都按筛选范围，overallSummary按整批。
- POST /api/inventory/import/preview {filename,base64,asOfDate} 返回{filename,sheetName,asOfDate,rowCount,summary,warnings,sample:前5item,sourceHash}。
- POST /api/inventory/import {filename,base64,asOfDate,expectedHash} 重新校验文件，hash须与预检一致，返回{snapshot}。文件摘要重复409，整批原子保存。不提供远程URL抓取。

读接口需登录；写和预检需admin。继承现有Host/Origin/JSON和bodyJson 6MB上限，Excel文件最大4MB、展开XML最多40MB、50000条商品、200个压缩条目。仅.xlsx，不执行公式，拒绝宏/密码/无必填表头/重复编码；图片仅保留安全http/https链接，不在服务端请求。

## 文件边界

父代理负责schema、domain、xlsx、CLI、app/db挂接、main导航和真实导入。库存后端代理负责server/inventory-db.mjs、server/inventory.mjs、tests/inventory-api.test.mjs，只通过契约导入父代理函数。页面代理负责src/pages/Inventory.jsx、src/inventory.css。

domain导出normalizeInventoryRows(matrix)、inventoryFlags(item)、summarizeInventory(items)。normalizeInventoryRows返回{items,warnings}。xlsx导出async parseInventoryWorkbook(buffer,{filename,asOfDate})返回{items,warnings,summary,sourceHash,filename,sheetName,asOfDate,rowCount}。db导出ensureInventorySchema(db)、importInventorySnapshot(db,parsed,userId)、inventorySnapshots(db)、queryInventory(db,params)，queryInventory返回GET响应。HTTP导出handleInventory({db,req,res,url,path,method,user,bodyJson,send})，处理成功true，不属于自身false。

CLI通过src和server通用模块导入，不把源文件、路径、真实数据或实际统计数写入提交。
