# Spark 六改交接清单（2026-09-15 凌晨 · 家里电脑 → 公司电脑）

> 接手前先读：`HANDOFF-spark-v4.md`（四修背景）→ 本文件。五修已完成并推到远端（见 WORKLOG「五修完成记录」）。
> 本清单 = Ann 二轮验收提的 6 个新问题：现象（她原话）→ 猫儿已定位的根因（文件:行号，基于本分支当前代码）→ 建议改法。

## 分支与规矩（不变）

- 只动 `feature/company-spark-circle-mode`，**不碰** my-custom / feat/block-coldwar / master，不 merge upstream
- **commit / push 前必须问 Ann**（铁律）
- 五修代码已全部提交并推送（含本文件）；接手后 `git pull` 即可开工
- 未跟踪杂物不进 git：`$null`、`debug-block-feature-runtime.md`、`dev-https.tmp.mjs`、`vite.config.ts.timestamp-*.mjs`、`vitest-results.json`、`.dev-certs/`（本机 https 证书）

## 建议开工顺序

六改-1（最小）→ 六改-2 → 六改-3 → 六改-6 → 六改-5 → 六改-4（**六改-4 需先问 Ann 确认意图，别闷头改**）

---

## 六改-1：发帖面板「选了图就不要选 emoji 了」（重复设计）

- **Ann 原话**：评论输入框设计优化，选了图就不要选 emoji 了。emoji 是作为背景的（真实小红书背景）。
- **根因**：`apps/SocialApp.tsx` 发布面板里图片选择区（约 L1790）和 emoji 贴纸区（约 L1821）并排常显。emoji 贴纸本质是「帖子背景大字」，选了真实图片后再选 emoji 背景确实重复。
- **改法**：互斥 UI——`newPostImages.length > 0` 时隐藏（或置灰）emoji 贴纸区，附一行小字「已选图片，emoji 背景停用」；清空图片自动恢复。落库逻辑 `images: imageRefs || [codepointToEmoji(newPostEmoji)]`（约 L961）本身已有「有图优先」语义，不用动。

## 六改-2：@ 的不是角色社交 id，是真名

- **Ann 原话**：艾特的不是角色的社交 id 而是真名。
- **根因**：`apps/SocialApp.tsx` 约 L352-360 初始化角色 handle 时：`handle: c.socialProfile?.handle || c.name`——角色没建社交档案（socialProfile.handle 为空）就**直接回退真名**。@ 选择列表（约 L1830-1855）和插入正文的 `@${mainHandle}`（约 L1845）用的都是这个值。
- **改法**：默认 handle 不许回退真名。推荐方案 A：没有 `socialProfile.handle` 的角色在 @ 列表里置灰显示「未开通社交账号」，点了提示先去身份管理补档案；备选方案 B：自动生成占位网名（如「用户+随机后缀」）。改完核对 `resolveSparkAuthor` 与 handle 匹配逻辑（约 L843-845 `handles.includes(...)`）两边来源一致。

## 六改-3：帖子带图 → 聊天卡片里显示一串图名和背景

- **Ann 原话**：主页帖子发了图，联动到角色聊天内时，不显示图了，显示的是一串图名和背景。
- **根因**：同步进聊天的 social_card 把**整个帖子快照**存进 `metadata.post`（`SocialApp.tsx` 约 L851），`post.images` 里是 `sparkimg:spark_img_xxx` 引用和 emoji 码点字符串。Chat.tsx 渲染 social_card 时按纯文本铺出来 → 用户看到一串 `sparkimg:...` + 码点。
- **改法**：Chat.tsx 渲染 social_card 时处理 `metadata.post.images`：`sparkimg:` 前缀 → 从 DB 读 asset 用 `SparkPostImage` 渲染真图（读不到降级「[图片]」占位）；纯数字码点 → `codepointToEmoji` 转真 emoji；其余字符串跳过。建议把 `SparkPostImage`（现内嵌在 SocialApp.tsx 约 L158）抽成独立小文件（如 `apps/social/SparkPostImage.tsx`）两边共用，别让 Chat 反向 import 大组件。

## 六改-4：删除评论没联动到聊天卡片；用户评论自己帖子没进私聊 ⚠️先问 Ann

- **Ann 原话**：删除评论没有联动到聊天内，原来的卡片还在，回复实际上还在。同步情况下，用户发帖评论自己帖子，没进私聊。
- **已定位的疑点**（代码里删评论确实调了同步，但同步可能漏）：
  1. `syncPostSnapshotToChats`（`SocialApp.tsx` 约 L1003-1019）要同步的角色集取自 `loadTrackedSparkPosts()[postId]?.charIds`——**只在「分享/让角色知道/@」时登记**。只评论过该帖、没被登记追踪的角色，卡片不会被改写 → 「回复实际上还在」。
  2. `handleDeleteComment`（约 L1023-1055）里 `updatePostInFeed` 后立刻 `syncPostSnapshotToChats`——若 `feedRef` 与 state 更新时序不同步，写进快照的可能还是旧评论列表。需核实 feedRef 刷新时机。
  3. 快照只重写 `metadata.post.comments`，若卡片 `content` 文本或别处还带评论摘要，也是残留源。
- **「用户评论自己帖子没进私聊」**：意图不明确——是希望「用户在自己帖下的评论也同步给角色（作为上下文）」，还是「用户评论自己这个动作要触发角色私聊」？**改之前必须问 Ann**，别猜。

## 六改-5：路人认知不隔离 + 抄袭已有回复

- **Ann 原话**：隔离路人认知，而且还会抄袭原有回复。
- **根因**：搅动评论区的演化 prompt（`apps/SocialApp.tsx` 约 L1186-1230 `evolveCommentSection` 及其 prompt 常量；`utils/chatPrompts.ts` social_card 相关块）没有给「路人」（charId 为空的 stranger）划知识边界，也没下禁复述的硬指令。
- **改法**：prompt 加两条硬线：
  1. **认知边界**：路人只知道——帖子标题/正文/tag/图片内容/评论区公开内容；禁止提帖子以外任何信息（用户真实身份、主聊天记录、私聊内容、其他圈子的世界观）。
  2. **禁止抄袭**：禁止复述、改写、换个说法重复已有评论的观点；每条新评论必须有新信息或新视角。
  先只靠 prompt 观察；若还抄，再上程序去重（生成结果与已有评论做相似度过滤）。

## 六改-6：私聊只能发一条，适配多条

- **Ann 原话**：当前发送到私聊只能有一条消息，适配多条。
- **现状**：演化输出每条评论可带 `"toPrivateChat": true`（`SocialApp.tsx` 约 L1225 的 JSON 格式说明），处理循环（约 L1244-1246、L1268-1275）技术上支持多条，但 AI 实际只吐一条；且每条落库是独立单条消息（前后包空行，约 L1271）。
- **改法**：输出结构升级为专门字段 `"privateChat": ["第一条", "第二条", ...]`（字符串数组 = 角色连续发的多条私聊），与评论对象分离；落库循环逐条存（条与条之间不加空行或只用换行，贴近真实聊天的连发感）；prompt 明示「可以连发好几条，像真人刷屏」；**保留对旧格式 `toPrivateChat: true` 的兼容解析**（旧帖子上下文还在用）。

---

## 环境备忘（公司电脑）

- 测试：`pnpm vitest run`（shim 损坏的机器用绝对 node 路径直跑 vitest，见 WORKLOG 2026-09-15 段）
- 公司网络跑 dev server 语音功能要带 `DEV_OUTBOUND_PROXY`（走本机 Clash 7890），地址以 Vite 打印的 Network 行为准（公司机惯例 :5188）
- 家里这台测试地址曾是 https://192.168.0.103:5173（.dev-certs 自签证书；纯 http 手机报 SSL 错）
