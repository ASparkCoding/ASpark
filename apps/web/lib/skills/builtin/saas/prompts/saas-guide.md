# SaaS 应用生成指南

## 核心数据模型

### Organization (组织/租户)
- id, name, slug, logo, plan_id, status (active/suspended/cancelled)
- owner_id, settings (JSON), createdAt

### Member (成员)
- id, org_id, user_id, role (owner/admin/member/viewer)
- invitedBy, joinedAt, status (active/invited/deactivated)

### Plan (订阅计划)
- id, name, slug, price, billingCycle (monthly/yearly)
- features (JSON array), limits (JSON: maxMembers, maxStorage, maxProjects)
- isPopular (boolean), sortOrder

### Subscription (订阅)
- id, org_id, plan_id, status (active/past_due/cancelled/trialing)
- currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd
- trialEnd

### Invoice (账单)
- id, org_id, subscription_id, amount, status (draft/open/paid/void)
- dueDate, paidAt, invoiceNumber

### Feature (功能开关)
- id, name, key, description, type (boolean/limit/usage)
- Used for feature gating per plan

### AuditLog (审计日志)
- id, org_id, user_id, action, resource, resourceId, details (JSON), createdAt

## 必须包含的页面

1. **Dashboard** - KPI 卡片 (MRR/用户数/活跃率) + 趋势图 + 最近活动
2. **团队管理** - 成员列表 + 邀请成员 + 角色变更 + 移除成员
3. **计费页面** - 当前计划 + 套餐对比 + 升降级 + 账单历史
4. **设置页面** - 组织信息 + 通知设置 + API 密钥 + 危险操作区
5. **审计日志** - 时间线展示 + 按操作类型筛选 + 导出

## 权限模型 (RBAC)

```
Owner:  所有权限 + 转让组织 + 删除组织
Admin:  管理成员 + 管理计费 + 管理设置
Member: 使用功能 + 查看数据
Viewer: 只读访问
```

## 业务逻辑要求

- 多租户隔离: 所有查询必须带 org_id 条件
- 功能门控: 根据 Plan 的 features 控制功能可用性
- 订阅生命周期: trial → active → past_due → cancelled
- 席位限制: 邀请成员前检查 Plan 的 maxMembers 限制
- 计费周期: 支持月付/年付切换，年付有折扣
