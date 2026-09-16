# HANDOFF-spark-v8c.md — Ann 晚间复检 6 条（0-5）· 施工单（给 flash）

> **代码状态**：分支 `feature/company-spark-circle-mode` @ `1802d75b`（本地=远端，工作区干净）。本单行号基于 1802d75b，仅供参考，**一切以搜索锚点为准**。
> **文案状态**：本单所有 UI 文案 / prompt 句子**均已由 Ann 定稿**（任务内逐字给出）——落码时一字不许改。
> **环境**：家里电脑（https 预览，`.dev-certs/`）。公司机 dev server（5188）别动。

## 开工铁律（违反会挨骂）

1. **本计划 ≠ commit 许可**。做完三验收，停在提交前报 Ann，点头才能 commit；push 单独问。
2. 只改点名文件和位置，别处一行不碰。
3. 每任务做完读回自查，再下一个。
4. 定稿文案一字不许自作主张。
5. 验收基线：tsc 历史错误 **47**（改动文件 0 新增）；`pnpm vitest run`（Spark 相关全过）；`pnpm build` 过（worker.bundle.js 若重生成且与本轮无关则还原）。

## 反馈 → 任务对照

| Ann 反馈 | 任务 | 性质 |
|---|---|---|
| 0. 关掉右下角测试版本号 | 任务 0 | 一行配置 |
| 1. 管理里角色头像不随主聊天头像更换；要加自定义头像 | 任务 1 | 代码 |
| 2. 发帖默认带所有角色人设记忆；加「圈子」+「不给谁看」 | 任务 2 | 代码 |
| 3. 删除评论的浏览器默认弹窗 → 小红书风格美化弹窗 | 任务 3 | UI |
| 4. 没同步没 @ 却出现角色私聊用户——私聊资格只认 @ 同步和按钮同步 | 任务 4 | 代码 |
| 5. 删除的评论要真删：任何上下文哪里都没有 | 任务 5 | 排查结论（病根=任务 2+4） |

**施工顺序**：0 → 3 → 5 → 1 → 4 → 2（2/4 已解耦，顺序可调）。

---

# 任务 0（反馈0）右下角 build badge 永久关闭

**排查结论**：badge 可见性是 vite.config.ts 里的编译时常量。当前逻辑 =「非 main/master 分支就显示」，我们在 feature 分支上所以天天显示。

**修法**：`vite.config.ts` 搜锚点：

```ts
let showBuildBadge = !isReleaseBranch;
```

改为：

```ts
let showBuildBadge = false; // Ann 2026-09-16：永久关闭右下角测试版本号（想看时挂 VITE_SHOW_BUILD_BADGE=1）
```

一行改动。`VITE_SHOW_BUILD_BADGE=1` 强制显示的通道保留（L51 那行不动）。README 不改。

**自查**：重启 dev server 后右下角 badge 和小扳手浮球（DevDebugPanel 同一开关）都消失；`pnpm build` 出来的产物同样不带。

---

# 任务 1（反馈1）Spark 角色头像：加自定义 + 动态跟随主聊天头像

**排查结论（已核实）**：
- 管理面板（马甲管理）里每行角色的头像（搜锚点 `<TokenImg value={c.avatar} className="w-6 h-6 rounded-full object-cover" />`，约 L2133）引用的是**活的** `CharacterProfile.avatar`，换头像后理论上是会跟着变的。
- 真正"一直是旧头像"的大头在**帖子流和评论区**：帖子和评论的头像是**生成那一刻的快照**（`post.authorAvatar` / `comment.authorAvatar`，生成路径 L677 / L824 / L1501-1503 存的是当时的 `matchedChar.avatar`）——之后换了主聊天头像，所有旧帖旧评的头像全部原地不动。
- TokenImg（`components/os/TokenImg.tsx`）无缓存问题，value 变即变，可以放心做动态解析。

**修法（四步）**：

1. **存储**：localStorage 新 key `spark_char_avatars`（`Record<charId, string>`，值 = 图片 URL 或 blobref 令牌，存储机制对齐角色主头像那套，TokenImg 直接能渲）。
2. **resolver**（SocialApp 内一个函数；MessageItem 若要用则放 utils 导出）：
   ```ts
   // Spark 角色头像解析：自定义 > 当前主聊天头像 > 生成时快照 > 名字 hash dicebear
   const resolveSparkCharAvatar = (authorCharId?: string, snapshotAvatar?: string, fallbackName?: string) => { ... };
   ```
3. **渲染端统一走 resolver**：帖子卡（feed 瀑布流）、帖子详情头部、评论行、楼中楼、管理面板角色行——凡是按 `authorAvatar` 渲染角色头像的地方，改成 `authorCharId ? resolveSparkCharAvatar(...) : 路人名字hash`。路人头像逻辑不动（v8 任务 5 已定稿的名字 hash 方案）。
4. **管理面板自定义入口（文案已定稿）**：点击每个角色行的**头像本身**弹小面板，文案逐字：标题 `{角色名}的 Spark 头像`，三个选项 `上传图片` / `填图片链接` / `恢复默认`（恢复默认 = 清掉自定义，回落主聊天头像），底部 `取消`。

生成侧**不动**：新帖新评照样写快照（兼容旧数据），显示以 resolver 为准。

**自查**：换主聊天头像 → 全部该角色的帖子/评论头像跟着变；给某角色设自定义头像 → 只有 Spark 里它变，主聊天不变；清自定义 → 回落主聊天头像；路人头像不受影响。

---

# 任务 2（反馈2）发帖生成上下文：「圈子」世界观 + 「不给谁看」

**方案（Ann 已定）**：只要两个选项——
1. **圈子**：发帖时选一个圈子（或不选）。选了只把该圈子的**世界观原文**放进 prompt，**不**因此把角色范围限定成圈内成员。
2. **不给谁看**：勾掉的角色 = 不发送它们的人设和上下文记忆。

最终拼起来的提示词 = 选中的世界观 + 没被勾掉的角色的记忆和人设。

**世界观纯净（硬规矩）**：世界观节里**只准装「圈子名 + worldPrompt 原文」两样**，绝不许拼进该圈子的成员名单、角色名、账号名、马甲、charId——否则被勾掉的角色还是会从世界观里漏进提示词。
- 当前代码 socialGeneration.ts L43-49 的 worldSection 已经是纯的（只有圈子名和 worldPrompt），flash 不得以任何理由往里加角色词条。

**排查结论（根因实锤）**：
- 生成上下文 `buildGenerationContext`（约 L571）给**每个进身份表的角色**拉**全量人设 + 记忆宫殿召回 + 近期私聊片段**（socialGeneration.ts L34-41，每条消息最多 800 字）。
- 参与者挑选 `selectSparkParticipants`（socialGeneration.ts L70-88）：楼主 + 评论过的人之外，**L81-84 无条件从候选池随机补 2 个角色**（上限 4）——不管这个角色是否该看到这条帖子。
- 两条评论生成路径（首评 `generateComments` L739、搅动 `evolveCommentSection` L1374）都走这套，且候选池 = 圈内角色或**全角色**。用户帖没有任何可见范围概念。

**数据结构（types.ts）**：`SocialPost` 加两个可选字段（老帖无字段 = 现状，完全兼容）：

```ts
worldCircleId?: string;      // 世界观来源圈子；undefined = 不附加世界观
excludedCharIds?: string[];  // 「不给谁看」名单：这些角色不进生成池，不发人设和记忆
```

**发帖面板 UI（文案已定稿）**：
- 加一行「**圈子**」：默认「不附加」，可选各圈子（下拉只列填了世界观的圈子）。选择器复用 @ 提及那套弹层交互。**语义：选了圈子 = 只附加该圈子的世界观原文**（圈子名 + worldPrompt），角色范围不因此受限。
- 加一行「**不给谁看**」：多选角色（复用 @ 提及选择器），勾掉的名字显示在输入框里。
- `startEditPost`（编辑帖子）回填这两个字段，可改，改完对下一次生成生效。

**生成路径接入（首评 generateComments + 搅动 evolveCommentSection，两处同款）**：
1. 候选池：**用户帖 = 全角色 − excludedCharIds**（`post.circleId` 从此只管 feed 分组，不再限定用户帖的角色范围）；AI 帖（刷新推荐流生成的）照旧逻辑不动。
2. 世界观：两处的 `postCircle` 改为按 `post.worldCircleId` 解析（与成员范围解耦）；没选 = 不带 worldSection。
3. 被勾掉的角色不进 `selectSparkParticipants` 候选、不进身份表、prompt 里没有任何它的档案。

**同步/分享/@ 不受影响**：这三样是 Ann 亲手点的显式动作，照旧（她点谁谁就能看到，不受「不给谁看」拦）。

**自查**：勾掉某角色 → 搅动/首评的身份表和 prompt 里完全没有该角色的档案和记忆；选了圈子 → prompt 只多该圈子的 worldSection，角色池仍是全角色（除被勾掉的）；老帖（无新字段）行为与现在完全一致。

---

# 任务 3（反馈3）删除评论 → 小红书风格专用弹窗

**现状**：`handleDeleteComment`（搜锚点 `const handleDeleteComment = async (post: SocialPost, comment: SocialComment)`，约 L1137）开头两连浏览器弹窗：L1138「删除这条回复？」+ L1139「让角色知道你删了这条回复吗？」。

**修法**：
1. 新建居中确认弹层（Spark 内部组件，风格对齐小红书：白底圆角卡、居中标题、正文说明、底部两键；遮罩半透明黑，弹入动画 0.2s 缩放淡入）。
2. **一张卡问完两个问题**（文案已定稿，逐字）：
   - 标题：`删除这条回复？`
   - 删除方式单选（两个胶囊选项，默认选中第一个）：
     - `悄悄删除`（= 原来的"取消"分支）
     - `删除并让角色知道`（= 原来的"确定"分支；选中时卡内显示小字说明：`会在你们的聊天里留下一条系统消息，Ta 会知道你动用了管理权限。`）
   - 按钮：左 `取消`（灰）右 `删除`（红 #FF2442）。点「删除」才真删，「取消」不动任何数据。
3. `handleDeleteComment` 改成接收弹窗结果（`{ confirmed: boolean, notify: boolean }`）的纯流程函数；两行 `window.confirm` 删除。
4. 确认键按下 → 关弹窗 → 走原有删除逻辑，一行不动。

**顺延项（本轮不做）**：`window.confirm` 全文件还有 4 处（L442 删圈子、L2199 清理图片、L2537 删笔记等），后续统一换同款弹窗时另开小单。

**自查**：删除全流程（含楼中楼连带删除、notify 通知、快照同步）行为与现在完全一致，只有弹窗长相变了；取消不动任何数据。

---

# 任务 4（反馈4）幽灵私聊：私聊能力必须跟着「同步」走

**规矩（Ann 已定）**：私聊能力的提示词只出现在「帖子被同步进该角色上下文」的时候——**@ 同步**和**右下角按钮同步**两种来路。没同步的角色，连这个提示词都看不到。继续走全局私聊权限设置（loadPrivateChatOff）。AI 角色帖的楼主角色**同样一刀切禁私聊**（没经过同步动作，不设特例、不放行）。

**排查结论（git 考古实锤）**：
- **chat 侧（同步卡）从来只有评论能力、没有私聊**：`chatPrompts.ts` L1142-1143 的能力说明（sparkFootprintLine，P6 起「只挂最后一张卡」）写的是 SPARK_COMMENT 评论三种写法 + 直接聊天，**通篇没有 privateChat 字样**。
- **私聊能力的授予长在 Spark 搅动 prompt 里**：五修 `f9ac44c2` 加了「### 公开还是私聊」节（发给所有在场角色，只排除路人）；v7 `184cc081` 改写成「### 私聊」节（privateChat 数组 + 全局开关）。两版都**没有**「该角色是否收到过这条帖子」的校验——这是幽灵私聊的唯一根因。
- **历史上下文两条通道已查死（不用再查）**：① 同步卡一人一份落库（`syncPostToChar` L883-897 按 charId 写），没同步的角色会话里没有卡；② 搅动请求的"近期私聊片段"用 `formatMessageForPrompt` 渲染（socialGeneration.ts L40），该函数**没有 social_card 分支**，历史里的 Spark 卡只剩一行 content 占位（`[Spark 动态·xxx]`），帖子快照/评论/能力说明全不渲染。搅动的帖子内容由搅动 prompt 当场现拼（`buildSparkCommentHistory`），不从历史片段来。
- **两条渲染路分工（别改错）**：同步的帖子内容**确实进角色上下文**——走**主聊天** `chatPrompts.buildMessageHistory` 的 social_card 专渲染（chatPrompts.ts L1254-1318：标题/正文/热评/身份行/追踪更新卡）。同步功能的意义就在这条路上，**不许动它**。搅动路径只留占位。能力说明（sparkFootprintLine）只在主聊天渲染时临时附加，内容只有评论区发言、无私聊字样。

**修法（两层）**：
1. **prompt 端开关**：搅动 prompt 的「### 私聊」节（约 L1427-1433，含 Ann 逐字定稿的节奏句、翻记录句）**原文一字不动、位置不挪**——改的只是**整节出现与否**：
   - 先取 `syncedIds = loadTrackedSparkPosts()[post.id]?.charIds || []`，与 `finalChars` 求交集；
   - 交集为空 → **整个私聊节不进 prompt**（没同步 = 连提示词都没有 = 模型根本不知道有这能力）；
   - 交集非空 → 私聊节按**原文**照常出现（**不点名、不改写、不加任何授予句**）。
2. **解析端硬闸（双保险，必做）**：搜锚点 `if (Array.isArray(c.privateChat))`（约 L1488）和 `if (c.toPrivateChat === true)`（约 L1497），matchedChar 判定后、落库前加 `if (!syncedIds.includes(matchedChar.id)) return;`（直接丢弃，不落库、不转公开评论）。两个分支同款，全局开关照旧先判（两层 AND）。

**自查**：新发一帖不 @ 不同步 → 搅动若干次，prompt 里没有私聊节，任何角色不输出 privateChat；@ 过 / 同步过的角色私聊照常；全局私聊开关关掉的角色照旧不私聊；AI 楼主角色帖同样无私聊。

---

# 任务 5（反馈5）已删评论进上下文：病根就是任务 2 + 任务 4

**已验证（无需改动）**：帖子本体删评是真删——`handleDeleteComment`（约 L1137）连楼中楼一起从 post.comments 删掉，`updatePostInFeed` 内存 + DB 同步更新；搅动的评论历史 `buildSparkCommentHistory` 读活数据，已删评论不会从这里进 prompt。

**结论（Ann 已裁定）**：出 bug 的是**非同步的新帖**——病根 = **任务 2（全量人设记忆发给随机角色）+ 任务 4（私聊能力无门槛）**。这两个修完，非同步新帖里不相干的角色根本不进上下文，此类回复不可能再出现。本任务无需单独写码。

---

# 完工三验收（同 v8）

1. `node node_modules/typescript/bin/tsc --noEmit` → 基线 47 历史错误，改动文件 0 新增。
2. `pnpm vitest run` → 历史遗留挂的不算，Spark 相关全过。
3. `pnpm build` → 通过。worker.bundle.js 重生成后若与本轮无关则还原。

**验收完停在 commit 前**，报 Ann：改动文件清单、验收数字、复检要点。等她点头才 commit。

# 事故备忘（同 v7/v8）

- 同一文件多处编辑必须串行（v8 踩过并行覆盖回写）。
- 任何 checkout/restore 后必须 `git status` 验收。
- dev server 不许自行停/重启（公司机 5188 是 Ann 存档源；家里跑预览用 Vite 当次打印的地址）。
- WORKLOG.md 完工后在本文件同目录顶部追加一节。
