# MiniWMS

基于**原生微信小程序 + 微信云开发**的轻量级仓库库存管理系统。以入库批次为核心，支持多租户隔离、邀请码协作、管理员审批，以及平方 ↔ 片数自动换算。

---

## 功能概览

### 用户与租户
- **创建仓库**：用户可创建独立仓库空间（数量上限可由系统管理员配置，默认 3 个）。
- **邀请码加入**：每个仓库生成唯一邀请码，新用户输入邀请码提交加入申请。
- **管理员审批**：仓库管理员审批加入申请，通过后即可操作该仓库库存。
- **系统管理**：系统管理员可审批新仓库创建、管理全局配置（每用户仓库上限、每条记录图片上限）。

### 库存管理
- **入库**：填写名称、长宽（厘米）、总平方或总片数，系统自动双向换算校验；支持上传入库图片（默认最多 3 张）。
- **出库**：支持按平方或按片数出库，实时预览折算数量；采用数据库事务保证并发安全。
- **清空**：一键清空批次剩余库存，流水记录保留。
- **库存列表**：按名称关键词搜索、按面积范围筛选；分页加载；支持"在库"与"已清空"标签切换。
- **图片管理**：入库后可继续增删图片，云端存储。

### 流水记录
- 每次入库、出库、清空自动生成 `stock_movements` 流水，可按批次查看完整历史。

---

## 项目结构

```
MiniWMS/
├── miniprogram/                  # 小程序前端
│   ├── app.js                    # 全局入口，云开发初始化
│   ├── app.json                  # 页面路由与窗口配置
│   ├── app.wxss                  # 全局样式（Teal 主题）
│   ├── utils/
│   │   └── api.js                # 统一云函数调用 & 工具函数
│   └── pages/
│       ├── bootstrap/            # 首页：仓库列表 / 创建 / 加入
│       ├── tenant/               # 创建仓库
│       ├── join/                 # 邀请码申请加入
│       ├── approvals/            # 管理员审批加入申请
│       ├── inventory/            # 库存列表（搜索、分页）
│       ├── inbound-form/         # 入库表单
│       ├── inbound-detail/       # 批次详情（出库、图片、清空）
│       ├── movements/            # 批次流水记录
│       └── system-admin/         # 系统管理（审批仓库、全局配置）
├── cloudfunctions/               # 云函数
│   ├── userBootstrap/            # 用户初始化，获取仓库列表与角色
│   ├── tenantCreate/             # 创建仓库空间
│   ├── joinRequestCreate/        # 提交加入申请
│   ├── joinRequestReview/        # 审批加入申请（列表 / 通过 / 拒绝）
│   ├── inventoryCreateInbound/   # 入库（事务写入记录 + 流水）
│   ├── inventoryList/            # 查询库存列表 / 单条详情
│   ├── inventoryOutbound/        # 出库（事务扣减库存）
│   ├── inventoryClear/           # 清空批次库存
│   ├── inventoryUpdateImages/    # 更新入库图片
│   ├── movementList/             # 查询批次流水
│   └── systemAdmin/              # 系统管理（审批仓库、配置读写）
├── project.config.json           # 微信开发者工具项目配置
└── README.md
```

---

## 快速开始

### 环境要求

| 工具 | 版本要求 |
|------|---------|
| 微信开发者工具 | 最新稳定版 |
| 基础库 | ≥ 2.2.3（需支持云开发） |

### 部署步骤

1. **导入项目**：打开微信开发者工具，导入本项目目录。AppID 请选择已开通云开发的小程序，不要使用游客模式。

2. **配置云环境**：在微信开发者工具中开通云开发，创建云环境后，将 `miniprogram/app.js` 中的 `cloud1-REPLACE_ME` 替换为你的云环境 ID。

3. **创建数据库集合**：在云开发控制台 → 数据库中创建以下 5 个集合：

   | 集合名 | 用途 |
   |--------|------|
   | `tenants` | 仓库空间 |
   | `tenant_members` | 仓库成员 |
   | `join_requests` | 加入申请 |
   | `inbound_records` | 入库批次记录 |
   | `stock_movements` | 库存流水 |
   | `system_config` | 系统全局配置 |

4. **部署云函数**：右键 `cloudfunctions/` 下的每个子目录，选择「上传并部署：云端安装依赖」。每个云函数自带 `common.js`，无需本地安装 Node 包。

5. **启动使用**：编译运行小程序，创建仓库后需等待系统管理员审批通过，之后即可使用邀请码邀请成员协作。

---

## 云函数说明

| 云函数 | 入口 | 功能 |
|--------|------|------|
| `userBootstrap` | 无参数 | 返回当前用户的 openid、所属仓库列表、待审申请、系统管理员状态 |
| `tenantCreate` | `{ name }` | 创建仓库空间，自动生成唯一邀请码 |
| `joinRequestCreate` | `{ inviteCode, remark }` | 通过邀请码提交加入申请 |
| `joinRequestReview` | `{ action, requestId? }` | `list` 查询申请；`approve`/`reject` 处理申请 |
| `inventoryCreateInbound` | `{ name, lengthCm, widthCm, totalArea, totalPieces, images?, remark? }` | 入库（事务：写记录 + 写流水） |
| `inventoryList` | `{ id? } 或 { status, page, pageSize, nameKeyword?, minArea?, maxArea? }` | 查询单条详情或分页列表 |
| `inventoryOutbound` | `{ inboundId, inputUnit, inputQuantity, remark? }` | 出库（事务：扣减库存 + 写流水） |
| `inventoryClear` | `{ inboundId }` | 清空批次剩余库存 |
| `inventoryUpdateImages` | `{ inboundId, images }` | 更新入库图片数组 |
| `movementList` | `{ inboundId, page, pageSize }` | 分页查询批次流水 |
| `systemAdmin` | `{ action, ... }` | `listPending`/`listAll`/`approve`/`reject`/`getConfig`/`updateConfig`/`getPublicConfig` |

---

## 数据模型

### tenants — 仓库空间
| 字段 | 说明 |
|------|------|
| `name` | 仓库名称 |
| `inviteCode` | 唯一邀请码 |
| `createdBy` | 创建者 openid |
| `status` | `pending` / `active` / `rejected` |
| `createdAt` | 创建时间 |

### tenant_members — 仓库成员
| 字段 | 说明 |
|------|------|
| `tenantId` | 所属仓库 |
| `openid` | 用户 openid |
| `role` | `admin`（管理员）/ `operator`（操作员） |
| `status` | `active` |

### join_requests — 加入申请
| 字段 | 说明 |
|------|------|
| `tenantId` | 目标仓库 |
| `openid` | 申请人 |
| `status` | `pending` / `approved` / `rejected` |
| `remark` | 申请备注 |

### inbound_records — 入库批次
| 字段 | 说明 |
|------|------|
| `tenantId` | 所属仓库 |
| `name` | 批次名称 |
| `lengthCm` / `widthCm` | 单片长宽（厘米） |
| `totalArea` | 总入库面积（m²） |
| `remainingArea` | 剩余面积（m²） |
| `totalPieces` | 总入库片数 |
| `images` | 图片 fileID 数组 |
| `status` | `active` / `cleared` |
| `remark` | 备注 |

### stock_movements — 库存流水
| 字段 | 说明 |
|------|------|
| `tenantId` | 所属仓库 |
| `inboundId` | 关联入库批次 |
| `type` | `inbound` / `outbound` / `clear` |
| `inputUnit` | `area`（平方）/ `pieces`（片数） |
| `inputQuantity` | 输入数量 |
| `areaDelta` | 实际面积变动（m²） |
| `pieces` | 片数变动 |
| `pieceArea` | 单片面积快照 |
| `remark` | 备注 |
| `operator` | 操作者 openid |

### system_config — 系统配置
| 字段 | 说明 |
|------|------|
| `adminOpenids` | 系统管理员 openid 数组 |
| `maxWarehousesPerUser` | 每用户最大仓库数（默认 3） |
| `maxImagesPerRecord` | 每条入库记录最大图片数（默认 3） |

---

## 权限模型

```
系统管理员 (system_config.adminOpenids)
  └─ 审批仓库创建 / 管理全局配置

仓库管理员 (tenant_members.role = admin)
  └─ 审批加入申请 / 入库 / 出库 / 清空 / 查看

仓库操作员 (tenant_members.role = operator)
  └─ 入库 / 出库 / 清空 / 查看
```

- 所有库存数据通过 `tenantId` 隔离。
- 云函数通过当前用户 `openid` 查询 `tenant_members`，仅 `active` 成员可访问对应仓库数据。
- 管理员接口额外校验 `role` 为 `admin`。

---

## 数量换算逻辑

```
单片面积 (m²) = lengthCm × widthCm / 10000

入库校验：
  |calculatedArea - totalArea| ≤ 0.05
  其中 calculatedArea = 单片面积 × totalPieces

出库：
  - 按平方：areaDelta = inputQuantity
  - 按片数：areaDelta = inputQuantity × 单片面积
  - 剩余面积 = remainingArea - areaDelta
  - 剩余片数 = floor(剩余面积 / 单片面积)
```

---

## 建议数据库索引

在数据量增长前可暂不建索引；正式使用建议添加：

| 集合 | 索引字段 |
|------|---------|
| `tenants` | `inviteCode` |
| `tenant_members` | `tenantId` + `openid` |
| `join_requests` | `tenantId` + `status` |
| `join_requests` | `openid` + `status` |
| `inbound_records` | `tenantId` + `createdAt` |
| `stock_movements` | `tenantId` + `inboundId` + `createdAt` |

---

## 技术栈

- **前端**：原生微信小程序（WXML + WXSS + JavaScript）
- **后端**：微信云开发（CloudBase）云函数
- **数据库**：微信云数据库（文档型 NoSQL）
- **存储**：微信云存储（入库图片）
- **事务**：云数据库事务（`db.runTransaction`）保证库存一致性
