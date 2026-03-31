# 电商应用生成指南

## 核心数据模型

### Product (商品)
- id, name, description, price, originalPrice, images (array), category_id
- stock, sku, status (active/inactive), featured (boolean)
- rating, reviewCount, salesCount

### Category (分类)
- id, name, slug, parentId (支持多级分类), icon, sortOrder

### Cart / CartItem (购物车)
- Cart: id, userId, status (active/completed/abandoned)
- CartItem: id, cartId, productId, quantity, price (快照价格)

### Order (订单)
- id, userId, status (pending/paid/shipped/delivered/cancelled/refunded)
- totalAmount, shippingAddress (JSON), paymentMethod, trackingNumber
- createdAt, paidAt, shippedAt, deliveredAt

### Payment (支付)
- id, orderId, amount, method (card/alipay/wechat), status (pending/success/failed)
- transactionId, paidAt

### Review (评价)
- id, productId, userId, rating (1-5), content, images, createdAt

## 必须包含的页面

1. **首页** - 轮播图 + 分类导航 + 推荐商品 + 新品上架
2. **商品列表** - 筛选(分类/价格/评分) + 排序 + 分页 + 网格/列表视图切换
3. **商品详情** - 图片轮播 + 规格选择 + 加入购物车 + 评价列表
4. **购物车** - 数量增减 + 商品选择 + 价格计算 + 结算按钮
5. **结算页** - 地址选择 + 支付方式 + 订单确认 + 优惠券
6. **订单列表** - 按状态筛选 + 订单卡片 + 物流跟踪
7. **用户中心** - 个人信息 + 收货地址管理 + 收藏夹

## UI 设计规范

- 商品卡片: 图片比例 4:3 或 1:1, 价格红色醒目
- 购物车: 右下角浮动按钮显示数量 badge
- 价格展示: 原价划线 + 现价加粗
- 状态标签: pending=黄, paid=蓝, shipped=紫, delivered=绿, cancelled=灰

## 业务逻辑要求

- 库存检查: 加入购物车和下单时都要检查库存
- 价格快照: 加入购物车时记录当前价格，避免价格变动影响
- 订单超时: 未支付订单 30 分钟后自动取消
- 评价权限: 只有已购买且已收货的用户可以评价
