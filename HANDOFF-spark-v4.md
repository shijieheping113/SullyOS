# 交接文档：Spark 圈子模式 v4 · 8 问题修复（探索完成，未动代码）

> 写给接手的 AI：本文档是完整的探索成果交接。**一行代码都还没改**，8 个问题的根因全部定位完毕，每个都给了精确的文件+行号+修法。按本文档从「待办清单」逐项执行即可。开工前请先扫一遍 [WORKLOG.md](./WORKLOG.md) 末尾几轮的记录（v3 修复 + 双机协作说明），了解上下文惯例。

## 背景速览（30 秒）

- 分支：`feature/company-spark-circle-mode`，上一轮 v3 修复已 commit（`0ae6d074`）并推上 GitHub，本地与 origin 已对齐（写作本文时 `git rev-list --left-right --count HEAD...origin` = 0/0）。
- 用户在手机上连局域网实测后报了 8 个新问题（即本文 P1-P8）。**测试地址不是固定的**：本机跑 `pnpm dev --host`，Vite 会打印 Local + Network 两个地址，用当次打印的 Network 地址（或 `ipconfig` 查本机 IPv4）拼 `http://<IPv4>:5188/` 给手机开。别假设任何写死的 IP。
- 项目是 pnpm + vitest；验证命令：`pnpm vitest run`、`pnpm build`（或 tsc 检查改动的文件）。
- 用户核心诉求一句话：**Spark（角色社交 App）的生成路径要对齐主聊天的记忆/上下文水平，互动反馈要闭环，行为要自然。**

## Git 现状快照（公司电脑，交班时刻）

- 本地 = origin/feature/company-spark-circle-mode = `0ae6d074`，无落后无领先。
- 工作区有两个"看起来改动"的文件（apps/SocialApp.tsx、components/PhoneShell.tsx）：**纯 LF/CRLF 换行符差异，内容零变化**（`git diff --ignore-cr-at-eol` 为空），可忽略、无需提交。
- 未跟踪新文件：本文档 `HANDOFF-spark-v4.md`（建议随下轮修复一起提交）；`.trae/` 是 TRAE 工具目录，不提交。
- 远端仓库：`origin = github.com/shijieheping113/SullyOS`（用户自己的 fork），另有 `upstream` 指向原作者仓库，别推错。
- 提交与推送由用户在终端自己执行（公司网络推送需代理 `http://127.0.0.1:7890`；家里网络不一定需要）。

## 关于作者记忆文档（用户特意贴的一段）

作者 README 说：长期记忆全靠 `ContextBuilder.buildCoreContext()` 统一组装，"只要往数据库里存了，ContextBuilder 会自动帮你塞进 Prompt"。

**核实结论：这段话对 P1 只成立一半。**

- ✅ 成立的一半：`utils/socialGeneration.ts` 的 `buildSparkGenerationContext()` **确实**对每个参与角色调了 `buildCoreContext(char, user, true, ...)`（includeDetailedMemories=true）。所以：人设、月度记忆摘要、印象档案、世界观、挂载的世界书——**只要存了就自动带上**，这部分不用我们写任何检索逻辑，别重复造轮子。
- ❌ 不成立的一半：**记忆宫殿（向量召回）不在这条自动链路上**。`buildCoreContext` 只读取 `char.memoryPalaceInjection` 这个字段；这个字段是靠 `injectMemoryPalace(char, recentMsgs)` 刷新的——主聊天每次请求前都在 [chatRequestPayload.ts L295](./utils/chatRequestPayload.ts) 调它，但 **Spark 的三条生成路径（刷新/加载评论/回复用户）从来不调**。结果：召回字段是空的或很久以前的旧值 → 角色在 Spark 里"记不起最近的事"的体感来源。

**所以 P1 的修法是：不要另写记忆检索，只要在 Spark 生成前把现成的 `injectMemoryPalace` 补调一次，让现成轮子转起来。**

## 8 个问题：根因 + 修法（已定位，待实施）

### P1 · Spark 生成不带记忆/聊天记录（高）

**根因**（两层）：
1. 记忆宫殿召回缺失（见上）。
2. 聊天记录窗口窄：`buildSparkGenerationContext` L26 只把近期私聊 `.slice(-6)`，且是"私聊片段"辅助行，不是主聊天的正位 message history。

**修法**：
- 在 `apps/SocialApp.tsx` 的 `buildGenerationContext`（L560-564）里，对每个 participant 先 `await injectMemoryPalace(char, recentMsgs)`（import 自 `../utils/memoryPalace/pipeline`），再交给 `buildSparkGenerationContext`。参考主聊天 [chatRequestPayload.ts L295-301](./utils/chatRequestPayload.ts) 的参数：`(char, recentMsgs, undefined, userProfile.name, { entryPoint })`。entryPoint 用一个新值如 `'spark'`（查一下 `RecallEntryPoint` 类型定义，若它是字面量联合需要加；若 string 则直接用）。
- 注意：injectMemoryPalace 内部会自己判断 `memoryPalaceEnabled` 开关（关了直接 return），所以不需要我们额外把关。
- 每个角色最近消息 `loadCharacterContextMessages(char)` 本来就在 L561-562 加载了，正好作 recentMsgs 复用。
- （可选加宽）`.slice(-6)` → `.slice(-12)`，防止过窄。私聊片段行已有截断 `.slice(0, 800)`，token 可控。

### P2 · 同步到聊天的帖子，角色评论报"帖子不在了"（高）

**根因**：[utils/chatParser.ts L224-227](./utils/chatParser.ts)——SPARK_COMMENT 动作只找 `role === 'user'` 的 social_card：

```ts
const shared = [...all].reverse().find(
    x => x.type === 'social_card' && x.role === 'user' && (x.metadata as any)?.post?.id,
);
```

但「同步到私聊」（handleSyncToChar）写的是 `role:'assistant'` 的卡 → 永远匹配不到 → 走 `else` 分支误报"还没分享过帖子/帖子不在了"。

**修法**：把匹配放宽——不再限 role，找最近一条**帖子还活着**的 social_card：先按原逻辑找 user 卡，找不到（或对应的帖已删）再找 assistant 侧 sync 卡（`metadata.post.id` 存在即可，`syncKind` 任意）。伪代码：

```ts
const cards = [...all].reverse().filter(x => x.type === 'social_card' && (x.metadata as any)?.post?.id);
const shared = cards.find(x => {
    // 用 DB.getSocialPosts() 的结果判断活没活；为省 IO 可先收集所有 postId 一次性查
});
```

注意幂等逻辑（L233-235 `already` 检查）保持不变。

### P3 · 回复对象/名字错位（3a 回复对象不准 / 3b 楼中楼变顶层 / 3c 回 A 名变 B）（高）

**根因**：`userCommentId` 参数身兼两职且互相矛盾：
- [SocialApp.tsx L994](./apps/SocialApp.tsx)：`const replyToId = userComment.replyToId;` —— 这是**用户评论的父级**（被回复的那条路人/角色评论）的 id，不是用户自己刚发的评论的 id！
- [SocialApp.tsx L879](./apps/SocialApp.tsx)：`replyToId: userCommentId` —— 把这个父级 id 当成 AI 回复的挂靠点。

后果分两种情况：
- 用户楼中楼回复路人 X → AI 回复也挂到 X 下（`replyToId = X.id`）→ 渲染时 AI 的回复与用户的评论平级，显示"角色回复了路人"（3a 的实际表现）。
- 用户直接评论（replyToId=undefined）→ AI 回复 replyToId=undefined → 成顶层普通评论（3b）。

**3c 名字错位**：prompt 里没告诉模型"必须由被回复的角色来回"，`selectSparkParticipants` 虽然把它强制塞进了身份表（L805-813），但模型可能选别人；加上 `resolveSparkAuthor` 靠网名模糊匹配，两个角色 handle 撞名时会解析错人。

**修法**（SocialApp.tsx 的 `handleSendComment` + `generateRepliesToUser`）：
1. `handleSendComment` L997 改传 `userComment.id`（用户自己那条评论的 id）：
   ```ts
   await generateRepliesToUser(updatedPost, contentToSend, userComment.id, replyTarget?.id);
   ```
   即函数签名改成 `(post, userContent, userCommentId, repliedToCommentId?)`。
2. `generateRepliesToUser` 内部：
   - L806 找"被回复的评论"时用 `repliedToCommentId`（父级），保持现在 L805-813 的强制进身份表逻辑（把查找 key 从 `userCommentId` 换成新参数）。
   - L879 挂靠点改为 `replyToId: userCommentId`（此时语义正确：用户自己的评论 id）→ AI 回复自然成为用户评论的楼中楼。
3. prompt（L828-848）加两行硬约束：
   - 被回复的评论作者是角色 X 时："第一条回复**必须**由 X（用 X 的账号）发出，直接接用户的话"。
   - 回复不要重复评论原文，别把名字写错——账号必须从身份表原样复制。
4. 3c 兜底：`resolveSparkAuthor` 保持现状（池内放行已在 v3 修过），prompt 约束为主。

### P4 · 刷新后新旧帖"混在一起"（高）

**核实结果**：数据顺序是**对的**——
- 挂载时排序：[SocialApp.tsx L245](./apps/SocialApp.tsx) `posts.sort((a,b) => b.timestamp - a.timestamp)`；
- 刷新插入：`prependUniqueSocialPosts`（[utils/socialFeedMerge.ts](./utils/socialFeedMerge.ts)）把新帖放数组最前；
- 渲染过滤 `filterPostsByCircle`（[utils/sparkCircles.ts L120](./utils/sparkCircles.ts)）不重排。

**真凶**：首页瀑布流用 CSS `columns-2`（[SocialApp.tsx L1513](./apps/SocialApp.tsx)）——CSS 多列布局是**先填满左列再填右列**，右列开头天然是旧帖，视觉上"新帖在最上、旧帖夹中间"的错乱感由此而来。

**修法**：改双列轮转分布（保留瀑布流观感，让两列都从最新开始交错排）：
- 方案 A（最小改动，推荐）：渲染前把帖子按 timestamp 降序 + 用 flex 两列手动轮转：
  ```tsx
  const posts = filterPostsByCircle(feed, activeCircleId, validCircleIds);
  const colA = posts.filter((_, i) => i % 2 === 0);
  const colB = posts.filter((_, i) => i % 2 === 1);
  // <div className="flex gap-2 items-start"><div className="flex-1 space-y-2">{colA.map(renderFeedItem)}</div><div className="flex-1 space-y-2">{colB.map(renderFeedItem)}</div></div>
  ```
  注意 `renderFeedItem` 已有 `mb-3`（L1039），改两列后可去掉 mb-3 用 space-y（或留着，小间距）。
- 个人主页 L1603 的 `columns-2` 同样处理（profileTab 的 notes/collects）。
- 挂载 effect L245 的 sort 保留（数据层排序无害）。

### P5 · 回复数量固定（总 2 个角色）（中）

**根因**：[SocialApp.tsx L839](./apps/SocialApp.tsx) prompt 写死"生成 1-3 条"，模型趋保守取 2；且解析后 `!newReplies.length` 会 throw（L882），0 条直接报错——不自然。

**修法**：prompt 改自然表述："由谁回复、回几条都由内容决定：可能没人接话（返回 `[]`），可能一个人回，也可能几个人你一言我一语；别为了凑数硬回"。同时把 L882 的 throw 改成 0 条时静默（不 toast 报错；可 toast "暂时没人接话" 用 info）。

### P6 · 多 spark 卡时模型混乱（中）

**根因**：[chatPrompts.ts L1239-1290](./utils/chatPrompts.ts) 的 social_card 块对每张卡都注入完整标题+正文+热评+SPARK_COMMENT 指令，多卡时 token 膨胀、指令重复。

**修法**（chatPrompts.ts 的 social_card 分支内）：
1. 利用 map 的 `index` 与 `historySlice`（L1148 已有 `apiMessages: historySlice.map((m, index) => ...)`）判断新旧：只对**最近 2 张** social_card 保留全量正文；更早的压缩成一行，如：
   `${timeStr}（你之前在 Spark 互动过帖子「${post.title}」——只列摘要，需要细节看最近的两张卡）`
   注意 map 是从旧到新，判断"是否属于最近 2 张"可以先算 `socialCardCount`（在 map 外先 reduce 一遍 historySlice 统计 social_card 总数，再在 map 里递减计数判断）。
2. SPARK_COMMENT 动作指令（L1289 那段）只在**最新一张** user 分享卡上带；旧卡去掉指令尾巴，避免模型被多次"可以去评论"催到混乱。
3. 压缩行保持"去不去自由"的口吻，与 v3 的追踪通知机制一致。

### P7 · 清空推荐流后：卡片还能点跳转 + 角色以为能回复（高）

**根因**（三处叠加）：
1. [Chat.tsx handleOpenSparkPost（约 L3181）](./apps/Chat.tsx)：设 `spark_jump_post_id` + openApp，不查帖子活没活。
2. [SocialApp.tsx 轮询 L348-368](./apps/SocialApp.tsx)：5 秒超时**保留 key** → 反复进 Spark 反复跳空。
3. [chatParser.ts SPARK_COMMENT 失败路径 L286/289](./utils/chatParser.ts)：只 toast，**不写聊天反馈** → 角色下一轮仍以为自己评论成功（成功路径有追踪通知卡，失败路径没有对应物）。

**修法**（闭环）：
1. **Chat.tsx**：`handleOpenSparkPost` 改 async：先 `DB.getSocialPosts()` 查，帖子不在 → toast「帖子已经不在了」+ return，不跳。
2. **SocialApp.tsx 轮询**：超时分支清掉 key（`localStorage.removeItem('spark_jump_post_id')`）+ toast「原帖已经不在了」。原注释里"下次挂载还能再试"的设计改为"查无此帖即止"，因为 Chat 侧已经把门，这里只处理竞态窗口。
3. **chatParser.ts 失败回写**：三个失败分支（帖子不在了/没分享过/异常 catch）各补一条聊天反馈，用现成 `persist()`（L168 已定义）：
   ```ts
   await persist({ charId, role: 'system', type: 'text', content: `[系统: ${charName} 想去 Spark 评论「${帖子标题或'已删除的帖子'}」，但帖子已经不在了，评论没有发出去。下次别再提这件事。]` });
   ```
   role:'system' + type:'text' 的消息走 [chatPrompts.ts L1464](./utils/chatPrompts.ts) 兜底分支 `content = timeStr + sourceTag + content`，会正常进模型上下文（日程系统提示 L537 就是这个形态，验证过可行）。UI 侧 role:'system' 不渲染成气泡——检查 `chatMessageVisibility` 是否需要放行（日程系统提示已有先例，照抄即可）。
4. **成功路径不变**。

### P8 · tag 全是 Vlog（中）

**根因**：[SocialApp.tsx L654](./apps/SocialApp.tsx) `tags: ['Life', 'Vlog']` 硬编码。

**修法**（handleRefresh 的 JSON schema，L600-612）：
1. schema 加 `"tags": ["从下面选 1-2 个：美食/吐槽/日常/深夜emo/搞笑/穿搭/旅行/恋爱脑/职场/学习/宠物/摄影/音乐/健身/读书"]`。
2. 解析时：`const tags = Array.isArray(item.tags) && item.tags.length ? item.tags.slice(0,2) : ['Life', 'Vlog']`。
3. tag 展示位在详情页 L1109（`selectedPost.tags.map`），无需改渲染。

## 待办清单（接手 AI 按此执行）

1. ☐ P1 buildGenerationContext 补 injectMemoryPalace（每 participant）+ slice(-6)→slice(-12)
2. ☐ P2 chatParser SPARK_COMMENT 匹配放宽（user 卡 → 活帖优先 → assistant sync 卡）
3. ☐ P3 handleSendComment 传 userComment.id + generateRepliesToUser 签名加 repliedToCommentId + prompt 硬约束
4. ☐ P4 首页 L1513 + 主页 L1603 的 columns-2 → flex 双列轮转
5. ☐ P5 prompt 自然数量 + 0 条不报错
6. ☐ P6 chatPrompts 旧 spark 卡压缩 + SPARK_COMMENT 指令只留最新卡
7. ☐ P7 Chat.tsx 存活检查 + SocialApp 轮询清 key + chatParser 失败回写 system 卡
8. ☐ P8 handleRefresh schema 加 tags + 解析回退
9. ☐ `pnpm vitest run` 全过 + `pnpm build`（或 tsc）零错误
10. ☐ 更新 WORKLOG.md（按现有格式：问题→病根→修法→检查过了→验收重点）
11. ☐ 提交 commit（用户会自己执行 git 命令，AI 不要自动 commit；提醒用户 `cd /d "d:\Trae work\SullyOS"` 进对目录再操作）

## 验收清单（手机连当局域网，地址看 Vite 当次打印的 Network 行，别用写死的 IP）

1. **P1**：先跟角色私聊几件新鲜事（当天）→ 刷新 Spark → 看角色帖子里是否有对得上的梗/记忆；回复/加载评论同样验证
2. **P2**：Spark 里角色发帖 → 「同步到私聊」→ 聊天里问角色那条帖子、诱导它说"我去评论下"→ 不再报"帖子不在了"，评论真实写入
3. **P3**：(a) 帖子评论区回复某路人的评论 → 角色回复应挂**我的评论**楼中楼下；(b) 直接评论 → 角色回复也是楼中楼不是顶层；(c) 回复 A 的评论 → 回复者就是 A（账号名对得上）
4. **P4**：刷新推荐流两次 → 两列都从最新开始交错往下，无"旧帖高居榜首"
5. **P5**：多回复几条评论 → 回复条数有 0/1/2/3 变化，不再恒定 2
6. **P6**：连续分享/互动 4+ 张帖子 → 回到聊天正常对话 → 角色不混乱、知道最近干了什么但不过度复述
7. **P7**：分享帖子 → 清空推荐流 → 聊天里的卡：点它提示"帖子不在了"不跳转；诱导角色评论 → 聊天里出现"没发出去"的系统反馈，角色下次不再提
8. **P8**：刷新多次 → 详情页 tag 有美食/吐槽/深夜emo 等变化，不再全 Vlog

## 探索过程中已核实、无需再查的事实

- `buildSparkGenerationContext` 已带 buildCoreContext(true) + worldbookMessages（v3 已修），**不要重复加**。
- `prependUniqueSocialPosts` 排序正确（fresh 在前），P4 不用它背锅。
- `filterPostsByCircle` 只过滤不排序。
- `resolveSparkAuthor` 池内放行已在 v3 修好，保持现状。
- `injectMemoryPalace` 签名：`(char, recentMessages?, queryHint?, userName?, traceContext?)`，见 [pipeline.ts L1156](./utils/memoryPalace/pipeline.ts)；内部自管 memoryPalaceEnabled 开关。
- 主聊天记忆链路参考：[chatRequestPayload.ts L294-301](./utils/chatRequestPayload.ts)（先召回再组 prompt）。
- chatParser 的 `persist()` 在 L168，所有落库必须走它（时间戳/幂等统一）。
- role:'system' 消息进 prompt 的先例：日程系统提示（chatParser L537）；UI 渲染可见性在 `utils/chatMessageVisibility.ts`。
- Chat.tsx 的 addToast 在约 L421（useOS 解构），可直接用。
- SOCIAL posts 存取：`DB.getSocialPosts()` / `DB.saveSocialPost()` / `DB.clearSocialPosts()`。
- MessageItem 三种 social_card 变体（L3098/L3130/L3159）的 onClick 调 onOpenSparkPost——存活检查放 Chat.tsx 入口即可，MessageItem 不用改。

## 已知坑

- SocialApp.tsx 被用户/linter 改过几次，**动手前先重新读目标段落校准行号**（本文行号是探索时的快照）。
- 测试有 socialGeneration.test.ts / sparkCircles.test.ts，改 P3/P4 涉及的函数若有测试覆盖，同步改断言。
- 提交信息惯例：中文、`fix: Spark 圈子x修--问题列表` 格式；WORKLOG.md 每轮必更。
