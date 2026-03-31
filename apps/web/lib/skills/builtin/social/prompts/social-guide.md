# 社交应用生成指南

## 核心数据模型

### Profile (用户资料)
- id, userId, displayName, username (unique), avatar, bio, website
- followersCount, followingCount, postsCount
- isVerified, isPrivate

### Post (动态/帖子)
- id, authorId, content (text), images (array), tags (array)
- likesCount, commentsCount, sharesCount, viewsCount
- visibility (public/followers/private), createdAt

### Comment (评论)
- id, postId, authorId, content, parentId (支持嵌套回复)
- likesCount, createdAt

### Like (点赞)
- id, userId, targetType (post/comment), targetId, createdAt
- Unique constraint: userId + targetType + targetId

### Follow (关注关系)
- id, followerId, followingId, status (active/pending for private accounts)
- createdAt

### Conversation (会话)
- id, type (direct/group), name (for groups), participants (array)
- lastMessageAt, createdAt

### Message (消息)
- id, conversationId, senderId, content, type (text/image/emoji)
- readBy (array), createdAt

### Notification (通知)
- id, userId, type (like/comment/follow/mention/message)
- actorId, targetType, targetId, content, isRead, createdAt

## 必须包含的页面

1. **Feed 首页** - 动态列表(无限滚动) + 发布入口 + 推荐用户
2. **个人主页** - 用户资料 + 动态列表 + 关注/粉丝数 + 编辑资料
3. **动态详情** - 完整内容 + 图片展示 + 评论区 + 点赞/分享
4. **消息列表** - 会话列表 + 未读标记 + 最后一条消息预览
5. **聊天界面** - 消息气泡 + 输入框 + 图片发送 + 时间分隔
6. **通知中心** - 按类型分组 + 已读/未读 + 跳转到相关内容
7. **搜索/发现** - 用户搜索 + 话题搜索 + 热门动态

## UI 设计规范

- Feed 卡片: 头像 + 用户名 + 时间 + 内容 + 互动栏(赞/评/转)
- 消息气泡: 自己蓝色靠右，对方灰色靠左
- 通知: 图标(心/评论/人) + 描述 + 时间，未读加粗
- 关注按钮: 未关注=蓝色填充, 已关注=灰色描边

## 业务逻辑要求

- Feed 排序: 默认按时间倒序，支持按热度排序
- 关注可见性: 私密账户需要对方同意才能关注
- 消息已读: 进入会话时批量标记已读
- 通知聚合: 多人点赞同一条动态合并为一条通知
- 内容安全: 支持举报和屏蔽功能
