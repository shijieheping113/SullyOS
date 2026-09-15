# HANDOFF-spark-v7.md — 12 条返工施工计划（给接手写代码的猫儿/flash）

> **这是什么**：2026-09-15 晚，Ann 复检六改后给 12 条返工清单，四轮计划评审全部定稿（她逐条拍板过措辞）。照着做，**不要自由发挥、不要顺手优化计划外的东西**。
> **代码状态（2026-09-16 凌晨更新：已施工完毕并提交）**：T1-T8 全部做完；之后 Ann 连夜逐字改定 4 份生成类 prompt（chatPrompts 能力说明 / SocialApp 搅动 / SocialApp 首次评论区 / SocialApp 刷推荐流），已照原文落码（只动文本零逻辑改动），称谓全库统一 user→用户、char→角色。以上已提交进分支 `feature/company-spark-circle-mode` 并推 origin。**当前待办：Ann 手机跑 9 步测试流程复检（含下文 8 条复检清单），复检过再谈下一步。识图附注的许可句（buildSparkFetchInit「可以聊图也可以不提」）Ann 未裁，不要动。**
> **行号仅供参考，一切以搜索锚点为准。**

## 开工铁律（违反会挨骂）

1. **本计划 ≠ commit 许可**。做完三验收，停在提交前报给 Ann，点头才能 `git commit`；push 单独问。
2. 只改点名文件和位置，别处一行不碰。
3. 每任务做完读回自查，再下一个。
4. 验收：tsc 基线 **47** 个历史错误（改动文件 0 新增）；`pnpm vitest run` **94/94**；`pnpm build` 过。
5. **prompt 写作铁律**（Ann 授课）：许可句会变倾向（「可以…也可以不」→默认不做，禁）；条件句会变门槛（「只有…才」→不敢做，禁）；正确写法=事实+能力+写法语法，行为交给"当下想怎么做，就怎么做"。成品提示词**逐字用**，Ann 定稿句**一字不动**。

## 涉及文件（只有 5 个）

- `apps/SocialApp.tsx`：T1 / T2 / T3 / T5 / T6 / T7 / T8
- `utils/sparkCircles.ts`：T2 水位、T6 开关
- `utils/chatParser.ts`：T2 水位（聊天侧）
- `utils/chatPrompts.ts`：T4 卡片注入
- `utils/socialGeneration.ts`：T5 标注强化

---

# 任务 1（返工①②）@ 全面解禁，显示一律社交 id 名

**背景**：`hasSocial = !!c.socialProfile?.handle` 判的是死字段——全库没人写入 `character.socialProfile`，Ann 填的账号名在 `characterHandles`（管理面板马甲，localStorage `spark_char_handles`）里 → 人人显示"未开通"，真通知全被拦。
**定稿语义**：默认角色名就是社交号；不限制 @，人人可 @ 且人人真通知（卡片进私聊）；@ 显示和插入文本一律用社交 id 名（马甲账号名优先，没配置用角色名）。

**1.1** `apps/SocialApp.tsx` 搜锚点 `五修-10 + 六改-2：@ 角色`（发帖面板 @ 列表）：
- 删 `const hasSocial = !!c.socialProfile?.handle;`
- `mainHandle` 改 `const mainHandle = (characterHandles[c.id] || [])[0]?.handle || c.name;`
- onClick 删整段 `if (!hasSocial) { addToast(...); return; }`
- 按钮显示 `@{mainHandle}`（删三元 `: '未开通社交账号'` 分支）
- className 删 `!hasSocial` 置灰分支，只留 mentioned/普通两态
- 区块注释改为：`/* @ 全角色可点可真通知；显示用社交 id 名——Ann 2026-09-15 定稿 */`

**1.2** 搜锚点 `六改-2b：@ 角色选择条`（评论弹层 @ 列表）：同 1.1 全部改动；onClick 往 commentInput 插文本逻辑保留。

**1.3** 搜锚点 `无档案角色：@ 只是外观，不通知`（handleSendComment 内）：
- 删整行 `if (!target?.socialProfile?.handle) continue;` 及注释行，循环其余保留（syncPostToChar 人人会走）。
- 循环前注释改 `// 评论里用户亲手 @ 的角色 → 全员真通知（卡片进私聊）`。

**不碰**：约 L337 默认马甲初始化 `handle: c.socialProfile?.handle || c.name` 原样保留；`resolveSparkAuthor`、`syncPostToChar`、CheckPhone.tsx 一律不动。
**自查**：全文件搜 `hasSocial`、`未开通社交账号`，应零命中。

---

# 任务 2（返工⑥）水位从"条数"改"评论 id 名单"

**背景**：`lastSyncedCommentCount` 记条数、按位置切片——删过评论就错位。Ann 拍板按评论 id 记已通知名单：一个号发多条=多个 id 互不干扰；删评论=对应 id 作废。红点那套（`initReplyWatermarks`/`spark_reply_watermarks`）是另一回事，**不碰**。

**2.1** `utils/sparkCircles.ts`：
- `TrackedSparkPost` 加可选字段 `seenCommentIds?: string[];`（`lastSyncedCommentCount` 保留做兼容，不再参与判定）。
- `loadTrackedSparkPosts()` 解析补：`seenCommentIds: Array.isArray(entry?.seenCommentIds) ? entry.seenCommentIds : undefined`。
- 加导出工具（逐字抄）：

```ts
/** 拿追踪条目的"已通知评论 id 名单"。旧数据第一次访问时按旧水位条数初始化，等价旧行为，一次性迁移 */
export function ensureSeenCommentIds(entry: TrackedSparkPost, comments: { id: string }[]): string[] {
    if (Array.isArray(entry.seenCommentIds)) return entry.seenCommentIds;
    const legacyCount = typeof entry.lastSyncedCommentCount === 'number'
        ? entry.lastSyncedCommentCount
        : (comments.length || 0);
    entry.seenCommentIds = (comments || []).slice(0, Math.max(0, legacyCount)).map(c => c.id);
    return entry.seenCommentIds;
}
```

- `trackSparkPost` 签名改 `(postId: string, charId: string, commentIds: string[])`：
  - 已有 entry：charIds 并入保留；`entry.seenCommentIds = [...new Set([...(entry.seenCommentIds || []), ...commentIds])]; entry.lastSyncedCommentCount = entry.seenCommentIds.length;`
  - 新 entry：`tracked[postId] = { charIds: [charId], seenCommentIds: [...commentIds], lastSyncedCommentCount: commentIds.length };`
  - 函数注释改"评论水位 = 已通知评论 id 名单"。

**2.2** `apps/SocialApp.tsx` `syncPostToChar`（搜 `五修-10：同步的核心实现`）：
- `trackSparkPost(post.id, charId, post.comments?.length || 0);` 改 `trackSparkPost(post.id, charId, (post.comments || []).map(c => c.id));`
- 文件顶部 sparkCircles import 行加 `ensureSeenCommentIds`。

**2.3** `apps/SocialApp.tsx` `updatePostInFeed`（搜锚点 `帖子追踪：帖子被分享/同步追踪过且评论数超过水位`）：try 块整段替换为：

```ts
try {
    const tracked = loadTrackedSparkPosts();
    const entry = tracked[postId];
    if (entry) {
        const all = result.post.comments || [];
        const seen = ensureSeenCommentIds(entry, all);
        const newComments = all.filter(c => !seen.includes(c.id));
        if (newComments.length) {
            Promise.all(entry.charIds.map(charId =>
                DB.saveMessage({ charId, role: 'user', type: 'social_card', content: '[Spark 帖子动态更新]', metadata: { post: result.post, syncKind: 'update', newComments } }),
            )).catch(console.error);
            entry.seenCommentIds = [...seen, ...newComments.map(c => c.id)];
            entry.lastSyncedCommentCount = all.length; // 兼容字段，不参与判定
            saveTrackedSparkPosts(tracked);
        }
    }
} catch {}
```

- 上方注释块改："帖子追踪：已通知名单里没有的评论 id → 给追踪角色追加「新动态」通知（id 名单制，删评论/连发多条评论都不错位）"。

**2.4** `apps/SocialApp.tsx` `handleSendComment`（搜锚点 `六改-4b：先预推追踪水位 1 格`）：
- 删"预推水位 1 格"整段 try/catch。
- 删"六改-4b：用户评论直达追踪角色"整段 `if (updatedPost) { ... }`（含 saveMessage 直达通知和水位 max 自愈）。
- 留注释：`// 水位 id 化后，用户评论自然命中 updatePostInFeed 的通用通知路径（新评论 id 不在名单里），直达链路和预推 hack 移除`。
- 保留：`lastUserCommentRef.current = {...}` 赋值（T7 用）、`setCommentInput('')`、`setReplyTarget(null)`、后面 commentMentions 段。

**2.5** `utils/chatParser.ts`（搜锚点 `entry.lastSyncedCommentCount = (livePost.comments?.length || 0) + 1;`）替换为：

```ts
const allIds = (livePost.comments || []).map(c => c.id);
entry.seenCommentIds = Array.isArray(entry.seenCommentIds)
    ? [...new Set([...entry.seenCommentIds, comment.id])]
    : [...allIds];
entry.lastSyncedCommentCount = allIds.length + 1; // 兼容字段，不参与判定
```

**自查**：全库搜 `lastSyncedCommentCount`——除定义/解析/兼容写入外，不应再有读取它做判定的代码。

---

# 任务 3（返工④）删评论后 newComments 同步过滤

**背景**：聊天 update 卡渲染 `metadata.newComments`（MessageItem.tsx 约 L3144，**该文件不用改**）。六改-4a 只重写 `metadata.post.comments`，没动 `newComments` → 被删评论永远留在卡上。
**改动**：`apps/SocialApp.tsx` `syncPostSnapshotToChats`（搜锚点 `六改-4a：同步名单`）里 `DB.updateMessageMetadata(card.id, ...)` 的 updater 替换为：

```ts
await DB.updateMessageMetadata(card.id, (prev: any) => ({
    ...prev,
    post: { ...(prev?.post || {}), comments: post.comments },
    newComments: Array.isArray(prev?.newComments)
        ? prev.newComments.filter((nc: any) => (post.comments || []).some(c => c.id === nc.id))
        : prev?.newComments,
}));
```

---

# 任务 4（返工⑤⑫）聊天卡片注入重写——旧卡纯事实，最新卡只挂能力说明

**背景**：分享卡每张带"（请…发表看法）"、@卡带"可以…自然回应"、同步卡带"不必主动复述"——邀请/指引永不过期，每次触发回复模型把没回应的卡全重演（"从节点 A 全部再回应"的根因）。12 号是 5 号伴生，本任务+T2 修完一起缓解。
**Ann 定稿能力说明（一字不动）**：①在 Spark 某个你现在想聊的帖子里的评论区公开发言；②直接继续聊天下去。当下想怎么做，就怎么做。

**4.1** `utils/chatPrompts.ts` 搜锚点 `const sparkFootprintLine = sparkTitleLine`：整段字符串替换为：

```ts
const sparkFootprintLine = sparkTitleLine
    ? `\n\n[你现在的能力]\n① 在 Spark 某个你现在想聊的帖子里的评论区公开发言。写法（三种，按需选）：\n   [[ACTION:SPARK_COMMENT|你的评论内容]] —— 评论你最近互动的那条帖子（顶层评论）\n   [[ACTION:SPARK_COMMENT|帖子标题|你的评论内容]] —— 指定评论某条帖子\n   [[ACTION:SPARK_COMMENT|帖子标题|那位网友:Ta那条评论的原话片段|你的评论内容]] —— 回复某条评论（挂进 Ta 的楼中楼）\n② 直接继续聊天下去。\n当下想怎么做，就怎么做。`
    : '';
```

（`sparkTitleLine` 收集逻辑、`if (index === sparkCardIdx)` 只挂最新卡的逻辑保留。写法语法是能力说明，保留；行为指引全删。）

**4.2** 同文件搜锚点 `（你的 Spark 动态——${kindLine}，留痕如下）`（assistant 同步卡分支）：
- kindLine 的 mentioned 分支 `'用户在帖子下 @ 了你——Ta 想让你看到这条笔记，可以像刷到熟人帖子那样自然回应（去评论区说话、或跟你私聊说都行）'` 改为 `'用户在帖子下 @ 了你'`（其余三分支不动）。
- content 结尾整句 `(这是你在 Spark 上的公开足迹，你自己当然记得；聊天里聊到相关话题时能自然对上，不必主动复述)` 删除。

**4.3** 同文件搜锚点 `这是「${post.title}」这条帖子的最新评论区动态`（update 卡分支）：
- content 结尾的 `(这是「…」这条帖子的最新评论区动态${bySelf ? '，其中你自己发的那条评论已经成功发布' : ''}；聊到时自然对得上即可，不必主动复述)` 改为只留事实：`${bySelf ? '（其中你自己发的那条评论已经成功发布）' : ''}`。

**4.4** 同文件搜锚点 `(请根据你的性格对这个帖子发表看法`（share 卡分支）：
- 删 `const isLatestSparkCard = ...` 和 `const commentHintLine = ...` 两个变量。
- content 整行改为：

```ts
content = `${timeStr} [用户分享了 Spark 笔记]\n楼主: ${postAuthorTag}\n标题: ${post.title}${tagsLine}\n内容: ${post.content}\n热评: ${commentsSample}${identityHint}${authorshipLine}`;
```

- 分支前 P6 注释块加一句："行为指引全部移除——旧卡=纯事实快照；能力说明只挂最新一张卡（sparkFootprintLine）。"

**自查**：chatPrompts.ts 搜 `请发表看法|可以自然回应|不必主动复述|请根据你的性格`，应零命中。

---

# 任务 5（返工③⑦⑧）演化/评论生成提示词重写

**背景**：③ 路人泄露私聊——私聊原文必须照给角色（玩法根），隔离靠**强提示词**：给路人立随机身份牌 + 硬约束"禁止输出角色私聊记忆内容细节"。⑦ 被点名角色不能装没看见。⑧ 评论区要主题走向。Ann 约束：**必须单次请求**（她的模型多为 RP 模型不支持并发、按次数计费），程序拦截/重roll 全部禁止（伤流畅）。

**5.1** `apps/SocialApp.tsx` `evolveCommentSection`（搜锚点 `### 公开还是私聊`，在约 L1279-1305 的 prompt 模板里）：

(a) 把「### 公开还是私聊（两个不同的社交场景）」整节（含下面三个要点行）替换为下面这节（逐字用）：

```
### 私聊
你发给用户的消息里，可以用 "privateChat": ["内容1", "内容2"] 把想说的话直接发到和用户的私聊里——只有用户看得到，评论区不显示。
它承载的是只想让用户一个人听到的话：悄悄话、贴脸的话、想避开评论区认真聊几句的。
要不要私聊、什么时候私聊、说几条，跟你在评论区发言一样——按你当下的想法判断，你想私聊就私聊。
```

(b) 把「### 认知边界（防路人开天眼，六改-5）」整节替换为（逐字用）：

```
### 路人（charId 为 null）：完全独立的陌生人，最高优先级
生成每条路人评论前，先给这个路人立一个具体的人设再开口：
- 身份从真实网民生态里随机取：学生、上班族、宝妈、店主、自由职业者、退休老人、深夜冲浪的年轻人……
- 各自带不同的年龄、职业、说话习惯、此刻刷帖场景（地铁上、睡前、摸鱼中……）
- 各自态度立场不同：有人共情楼主、有人抬杠、有人只顾玩梗、有人较真科普、有人纯粹看热闹——不同路人之间观点要有区分度，别步调一致
- 路人的一切视角只从这两个来源出发：①这条帖子的标题、正文、配图、tag、评论区已公开的内容；②他自己的人生经验
- 路人和用户、和任何角色都是初次刷到的关系：你们私下聊过什么、是什么关系、彼此怎么称呼——这些信息对路人不存在，就像地铁上刷到陌生人的帖子
- **禁止输出任何角色私聊记忆的内容细节**：上面身份资料区里出现的私聊片段、用户与角色的私下对话细节，路人一概不知道，评论里绝对不能出现、不能暗示、不能换说法转述
- 自检：任何一条路人评论，如果出现了"只有熟人/私聊/帖子之外才知道"的信息，这条作废，换一个路人重写
- 路人进场先看讨论走到哪了——接话、追问、抬杠优先冲着已有讨论去，不自顾自开新话题
```

(c) 在替换后的路人节和「### 禁止抄袭已有评论（六改-5）」之间，插入这一节（⑦，逐字用）：

```
### 用户点名的角色
用户评论里直接 @ 到的角色、或用户在楼中楼里回复的那个角色：这条评论 Ta 看到了。Ta 怎么回应由人设决定，但不会像没看见一样。
```

(d)「### 禁止抄袭已有评论（六改-5）」节**保留原样不动**。
(e) 输出格式 JSON Array 里 `privateChat` 字段的说明行，改写为与新私聊节一致（删掉"（角色想私聊用户时才加；想连发几条就放几条，只发一条就放一条）"这半句，换成 `或省略`）：

```
{ "author": "网名 (Handle) 或路人昵称", "charId": "角色ID或null", "content": "评论内容...", "replyTo": "要回复的已有评论的作者名，顶层新评论填 null", "privateChat": ["想说的第一条", "第二条", ...] 或省略 }
```

(f) prompt 里其余部分（任务描述、内容红线、身份表约束、禁令）不动。**注意**："内容红线（防 AI 八股）"节保留；"完全交给内容和你的人设自然决定"那节保留。

**5.2** 首次生成评论的 prompt（同一个文件，搜锚点 `purpose: '生成帖子评论'` 所在函数，其 prompt 里搜 `楼中楼（评论区常见形态）`）：在它的「### 禁令」节之前插入 5.1(b) 的路人节和 5.1(c) 的点名节（同两段原文）。这个 prompt 没有 privateChat 输出（老路径），只加路人约束，别加私聊节。

**5.3** `utils/socialGeneration.ts` 搜锚点 `近期私聊片段（只用于该角色理解关系，不得在公开评论泄露）`（约 L39-40）：把行首标注改为：

```
近期私聊片段（【角色私人记忆】——只用于该角色理解关系；生成路人（charId 为 null）的评论时视同不存在，禁止输出其中任何细节）:
```

后面拼接逻辑不动（原文照给角色）。

**自查**：搜 `认知边界`，旧节名应已被替换；evolve 和首次评论两个 prompt 都含 `禁止输出任何角色私聊记忆的内容细节`。

---

# 任务 6（返工⑨）Spark 私聊 per-character 开关

**背景**：Ann 要"每个角色单做开关"治狂戳；开关是**程序级硬闸**（关=该角色 privateChat 直接丢弃，绝不转成公开评论），prompt 里不加任何数量/频率限制（AI 每次都是第一次，硬限也没法靠它自觉）。prompt 部分已并入 T5 的私聊节。

**6.1** `utils/sparkCircles.ts` 加存取工具（逐字抄）：

```ts
// --- Spark 私聊私戳开关（Ann 2026-09-15 拍板：per-character 硬闸）---
// 名单语义：只记"被关掉"的角色（不在名单 = 允许私聊）。
const SPARK_PRIVATE_CHAT_OFF_KEY = 'spark_private_chat_off';

export function loadPrivateChatOff(): Record<string, true> {
    if (typeof localStorage === 'undefined') return {};
    try {
        const parsed = JSON.parse(localStorage.getItem(SPARK_PRIVATE_CHAT_OFF_KEY) || '{}');
        return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch { return {}; }
}

export function setPrivateChatOff(charId: string, off: boolean): void {
    const all = loadPrivateChatOff();
    if (off) all[charId] = true; else delete all[charId];
    try { localStorage.setItem(SPARK_PRIVATE_CHAT_OFF_KEY, JSON.stringify(all)); } catch {}
}
```

**6.2** `apps/SocialApp.tsx`：
- 顶部 import：从 `../utils/sparkCircles` 补进 `loadPrivateChatOff, setPrivateChatOff`。
- 演化解析处（搜锚点 `六改-6：私聊升级`，`if (Array.isArray(c.privateChat))` 分支）：在 `if (matchedChar)` 里最前面加：

```ts
if (matchedChar && loadPrivateChatOff()[matchedChar.id]) return; // 开关关闭：私聊直接丢弃，不转公开评论
```

- 兼容旧格式分支（`c.toPrivateChat === true`）同样加这行。

**6.3** 管理面板 UI（搜锚点 `+ 添加马甲`，约 L1940，身份管理 Modal 里每个角色的行）：在该角色行的操作区（「+ 添加马甲」按钮旁边）加一个小开关，建议样式与该面板现有小按钮一致：

```tsx
<button
    onClick={() => { setPrivateChatOff(c.id, !loadPrivateChatOff()[c.id]); /* 乐观更新：用 state 触发重渲染 */ setIdentityGroupId(v => v); addToast(loadPrivateChatOff()[c.id] ? `${c.name} 的 Spark 私聊已关` : `${c.name} 的 Spark 私聊已开`, 'info'); }}
    className="text-[10px] px-2 py-1 rounded-full border active:scale-95 transition-transform"
    style={loadPrivateChatOff()[c.id]
        ? { background: '#f1f5f9', color: '#94a3b8', borderColor: '#e2e8f0' }
        : { background: '#ff2442', color: '#fff', borderColor: '#ff2442' }}
>{loadPrivateChatOff()[c.id] ? '私聊关' : '私聊开'}</button>
```

- 注意：`loadPrivateChatOff()` 是函数直调（localStorage 不驱动 React），点击后需要触发重渲染——上面用 `setIdentityGroupId(v => v)` 强刷（简单可靠，弱模型别用 useMemo 优化）。若 `identityGroupId` 变量名对不上（搜 `GROUP_FILTER_ALL` 确认），换该组件里任意一个 setXxx 皆可，或在组件加 `const [, forceTick] = useState(0)` 后 `forceTick(t => t + 1)`。
- 按钮文案不要 emoji；toast 文案照抄。

**自查**：管理面板开关关掉某角色 → 手动搅动一个该角色可能私聊的帖子 → 该角色 privateChat 被丢弃、评论区/私聊都不出现。

---

# 任务 7（返工⑩）评论里 @B：让 B 接 A 的话

**背景**：现在评论 @ 只落一张知会卡；B 会不会来接话全看下一轮搅动随机抽人+模型自由发挥。修法：把"@意图"传进演化——被 @ 角色强制进本轮名单 + prompt 写明"用户想看 B 和 A 交流"。

**7.1** `apps/SocialApp.tsx` 找 `lastUserCommentRef` 的声明（搜 `lastUserCommentRef = useRef`）：类型加字段 `mentionedCharIds?: string[]`（若无显式类型就把赋值处带上该字段即可）。

**7.2** `handleSendComment` 里 `lastUserCommentRef.current = { ... }` 赋值处（搜 `P3 保留`）：加一个字段：

```ts
mentionedCharIds: [...commentMentions],
```

**7.3** `evolveCommentSection`（搜锚点 `const selectedChars = selectSparkParticipants(post, ...)`，约 L1252）：这行之后加：

```ts
// 返工⑩：用户刚 @ 的角色强制进入本轮名单（去重并入）
const mentionIds = (lastUserCommentRef.current?.postId === post.id && Array.isArray(lastUserCommentRef.current.mentionedCharIds))
    ? lastUserCommentRef.current.mentionedCharIds : [];
const forcedChars = mentionIds
    .map(id => characters.find(c => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c && !selectedChars.some(s => s.id === c.id));
const finalChars = [...selectedChars, ...forcedChars];
```

然后把后面用到 `selectedChars` 的**两处**改为 `finalChars`：`buildGenerationContext(finalChars, postCircle)` 和解析循环里的 `resolveSparkAuthor(c, finalChars, candidatePool, ...)`（搜 `resolveSparkAuthor(c, selectedChars, candidatePool`）。其余 `selectedChars` 引用不动（如有其他处，逐个看是否该跟，拿不准就保留并在完工报告里注明）。

**7.4** 同函数 `recentLine` 构造处（搜锚点 `用户「${socialProfile.name}」最近在评论区发的评论`）：在这个三元表达式后面追加一段（拼在 recentLine 之后）：

```ts
let mentionLine = '';
if (mentionIds.length) {
    const replyToName = (() => {
        const rid = lastUserCommentRef.current?.repliedToCommentId;
        const target = rid ? (post.comments || []).find(c => c.id === rid) : undefined;
        return target?.authorName;
    })();
    const mentionedNames = mentionIds
        .map(id => characters.find(c => c.id === id))
        .filter(Boolean)
        .map(c => (characterHandles[c!.id] || [])[0]?.handle || c!.name);
    mentionLine = `\n**用户在这条评论里 @ 了 ${mentionedNames.join('、')}**${replyToName ? `——Ta 在回复 ${replyToName}，想看被 @ 的人和 ${replyToName} 就这个话题交流` : '——Ta 想看被 @ 的人来接这条线'}`;
}
```

然后把 prompt 模板里 `${recentLine}` 改为 `${recentLine}${mentionLine}`。

**自查**：评论里回复 A 并 @ B → 搅动 → B 的大概率出场且回应跟 A 相关（prompt 是软约束，不保证 100%，但意图已送达）。

---

# 任务 8（返工⑪）发帖/评论 @ 的删除

**背景**：两个口子——(a) 取消按钮和重新打开发布面板都不清 `newPostMentions`，@ 过一次永久挂名单；(b) 点掉选中只删名单、不删正文里已插入的 `@网名 ` 文本。定稿：@ 记录以**发布时点选状态**为准（现有 `mentions: [...newPostMentions]` 保留），面板打开/取消时清空，toggle off 同步删正文尾巴。

**8.1** `apps/SocialApp.tsx` 搜锚点 `打开发布笔记面板`（约 L2379 的 `+` 按钮）：onClick 改为：

```tsx
onClick={() => { setNewPostMentions([]); setIsCreateOpen(true); trackEvent('打开发布笔记面板'); }}
```

**8.2** 搜锚点 `取消`（发帖面板头部，约 L2052 的取消按钮）：onClick 改为：

```tsx
onClick={() => { setNewPostMentions([]); setEditingPostId(null); setIsCreateOpen(false); }}
```

**8.3** 发帖 @ 列表 toggle off 分支（搜锚点 `五修-10 + 六改-2：@ 角色`，onClick 的 `if (mentioned)` 分支）：在 `setNewPostMentions(prev => prev.filter(...))` 后加删正文尾巴（只删末尾那一条，位置被动过就匹配不到、安全降级不删）：

```ts
if (mentioned) {
    setNewPostMentions(prev => prev.filter(id => id !== c.id));
    const tail = new RegExp(`@${mainHandle.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*$`);
    setNewPostContent(prev => prev.replace(tail, ''));
}
```

**8.4** 评论 @ 列表 toggle off（搜锚点 `六改-2b：@ 角色选择条`，onClick 的 `if (mentioned)` 分支）同样加：

```ts
if (mentioned) {
    setCommentMentions(prev => prev.filter(id => id !== c.id));
    const tail = new RegExp(`@${mainHandle.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*$`);
    setCommentInput(prev => prev.replace(tail, ''));
}
```

**8.5** `startEditPost`（搜锚点 `五修-11：进入编辑模式`）里已有的 `setNewPostMentions([])` 保留不动。
**自查**：@ 两个角色 → 取消 → 重开 → 名单为空；@ 一个角色再点掉 → 正文尾巴消失；发布 → 只通知发布时还选着的。

---

# 施工顺序与总验收

**顺序**：T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8（T1-T3 是代码修复先做完；T4-T5 提示词；T6-T8 小功能）。

**完工三验收**（都在项目根 `SullyOS-master\SullyOS-master`）：
1. `node node_modules/typescript/bin/tsc --noEmit`（或现有 tsc 入口）→ 基线 47 历史错误，改动文件 0 新增。
2. `pnpm vitest run` → 94/94。
3. `pnpm build` → 通过。build 会重生成 `worker/amsg/worker.bundle.js`——若内容变化，检查是否与本轮无关；无关则**还原**（六改当时就是这么处理的，worker 不在本轮范围）。

**验收完停在 commit 前**，报 Ann：改动文件清单、验收数字、复检要点。等她点头才 commit。

# Ann 手机复检清单（完工后转给她）

1. 发帖/评论 @ 列表：所有角色可点、显示账号名（没配置的显示角色名）；@ 发帖 → 角色私聊收到「用户 @ 了你」卡。
2. 同步过的帖子删评论 → 聊天「新动态」卡里该评论消失。
3. 搅动：路人评论不再出现私聊细节；路人之间身份/态度有区分度；评论区有主题走向、不狂加新路人。
4. 评论里回复 A 并 @ B → 搅动后 B 接 A 的话线。
5. 管理面板：每角色私聊开关，关掉的角色不再私戳。
6. 私聊触发回复：角色接着聊天最后一句走，不再把没回应过的帖子全部重演一遍。
7. 发帖 @ 取消/重开面板 → @ 名单清空；toggle off → 正文尾巴删除。
8. 一个号连发多条评论/删评论后再加评论 → 追踪通知一条不漏、一条不重。

# 事故备忘（上一只猫儿踩过的坑）

- 家里 bash 缺 grep/sed/wc/head/tail，用 git 自带命令 + IDE 专用工具；node 用绝对路径。
- 任何 checkout/restore 后必须 `git status` 验收（曾因 checkout 中断丢 1200+ 工作区文件）。
- dev server 不许自行停/重启（Ann 的命令清单外动作一律先问）。
- WORKLOG.md 在外层 `D:\SullyOS\WORKLOG.md` 和项目内各有一份传统——完工后在本文件同目录 WORKLOG.md 顶部追加一节（改动文件清单+验收数字+复检清单引用）。

