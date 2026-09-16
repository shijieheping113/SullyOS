# HANDOFF-spark-v8.md — Ann 手机复检 11 条反馈 · 排查结论与施工单（给 flash）

> **这是什么**：2026-09-16 上午 Ann 对 v7（`184cc081`）手机复检后给 11 条反馈，猫儿逐条排查后写定的施工单。其中 2 条 prompt 是 Ann 逐字定稿（一字不动照抄）、1 条 Ann 已拍板 B 案、2 条排查结论=不施工。照着做，**不要自由发挥、不要顺手优化计划外的东西**。
> **代码状态**：分支 `feature/company-spark-circle-mode` @ `184cc081`（本地=远端）。本单行号基于 184cc081，仅供参考，**一切以搜索锚点为准**。
> **环境**：公司机 dev server 跑在 `http://10.48.18.221:5188/`（Ann 手机存档所在源，别动端口别重启）。公司机 shell 命令前加 `export PATH="/c/Program Files/Git/usr/bin:$PATH"`。

## 开工铁律（违反会挨骂）

1. **本计划 ≠ commit 许可**。做完三验收，停在提交前报给 Ann，点头才能 commit；push 单独问。
2. 只改点名文件和位置，别处一行不碰。
3. 每任务做完读回自查，再下一个。
4. **Ann 定稿 prompt 一字不动照抄**（包括「贴子」这种她的用字，不许改）。
5. 验收基线：tsc 历史错误 **47**（改动文件 0 新增）；`pnpm vitest run` 全过（历史遗留挂的几个不算，Spark 相关必须全过）；`pnpm build` 过（worker.bundle.js 若重生成且与本轮无关则还原）。

## 反馈 → 任务对照

| Ann 反馈 | 任务 | 性质 |
|---|---|---|
| 1. 谷歌模型 400 高概率 | 任务 11 | **不施工，等证据** |
| 2. 评论可与角色用户无关（给定稿） | 任务 1 | prompt 逐字落码 |
| 3. 评论改原位编辑框 | 任务 8 | 代码 |
| 4. 回复评论输入空白 | 任务 3 | 代码 |
| 5. 私聊通知文案写死 | 任务 4 | 代码 |
| 6. 路人头像每次变 | 任务 5 | 代码 |
| 7. 路人复读/敷衍抄（给定稿） | 任务 2 | prompt 逐字落码 |
| 8. 通知数量大于实际 | 任务 6 | 代码 + 观察日志 |
| 9. 删空后同步卡还在 | 任务 7 | 代码（Ann 拍板 B） |
| 10. 长按删除是真删吗 | 任务 10 | **排查结论=无需施工** |
| 11. 封面 emoji 乱码「OPCOR」 | 任务 9 | 代码 |

**施工顺序**：任务 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9。任务 10、11 零改动。

---

# 任务 1（反馈2 · Ann 逐字定稿）路人评论与人物无关声明——两个评论 prompt 都加

**定稿原文（一字不动）**：

```
- 路人的评论不一定跟用户与角色相关，由他的视角自然决定：大多数评论就是对着帖子本身说话——就事论事、玩梗、吐槽、科普，跟任何角色和用户都没有关系，不需要挖掘或呼应账号背后的人物与关系
```

**1.1** `apps/SocialApp.tsx` 搅动 prompt（evolveCommentSection 内）：搜锚点 `### 新刷进来的陌生网友（charId 为 null）：偶尔才有，一条没有是常态`，在该节末尾（`- 和用户、和任何角色都是初次刷到的关系，别硬认。` 这行之后）追加上面定稿行。

**1.2** 同文件首次评论生成 prompt：搜锚点 `### 路人（charId 为 null）：刷到这条帖子的陌生网友`，在该节末尾（`- 路人和用户、和任何角色都是初次刷到的关系，别硬认。` 这行之后）追加同一段定稿原文。

**自查**：全文件搜 `不需要挖掘或呼应账号背后的人物与关系`，应恰好 2 处；两个 prompt 其余文字零改动。

---

# 任务 2（反馈7 · Ann 逐字定稿）搅动「禁止复读」条重写

**位置**：`apps/SocialApp.tsx` 搅动 prompt 的禁令节，搜锚点：

```
- 禁止复读：不重复已有评论说过的话，不机械复读同一个梗；接话可以，换皮复读不行。
```

（首次评论 prompt 里还有一条同头不同尾的 `- 禁止复读：不重复已有评论说过的话，不机械复读同一个梗。`——**那条不动**，只改搅动这条。）

**整行替换为（一字不动，注意「贴子」是 Ann 原文用字）**：

```
- 禁止复读：如果是贴子里已经有的路人继续发评论，要带着新东西开口——接着自己上一次的话往下走（接话、补充、改口、被说服、抬杠升级、回复别人都可以），不许原地重复或换皮重复自己已经说过的观点；也不机械复读同一个梗。
```

**自查**：搜 `换皮复读`——应零命中（旧词已被替换）；搜 `抬杠升级`——应恰好 1 处（搅动 prompt 内）。

---

# 任务 3（反馈4）评论弹层输入空白（vivo 打字不显示）

**排查记录（已核实）**：textarea 绑定正常（`value={commentInput}` + onChange 都在）；`disabled` 卡死路线已排除——`loadingComments / isReplyingToUser` 的复位路径齐全（L1221 / L1523-1524），且 disabled 状态连键盘都弹不出，与「能打字但内容空白」不符。**主嫌**：弹层容器挂 `transition-transform duration-[340ms]` + `style willChange: 'transform'`（升起动画），vivo WebView 的合成层在 transform 动画结束后不重绘输入内容——点 @ 触发 state 变化强制重绘所以「好了」，下次开弹层动画又犯。经典 Chromium 合成层 + IME 渲染 bug。

**修法**：`apps/SocialApp.tsx` 搜锚点 `Composer Sheet —— 七改-UI`（约 L1801）：

1. 删掉 `style` 里的 `willChange: 'transform'`（整个 style 属性里只剩 transitionTimingFunction，保留）。
2. 给该容器加 `onTransitionEnd`：transform 过渡结束时把 willChange 归位，强制浏览器拍平合成层：

```tsx
onTransitionEnd={(e) => { if (e.propertyName === 'transform') (e.currentTarget as HTMLElement).style.willChange = 'auto'; }}
```

（动画保留——升起手感不动，只是动画结束就拍平图层。）

**兜底预案（先不做）**：若 Ann 手机实测仍空白，再改方案=升起动画整个去掉（只在收起方向播动画），那要她点头才动。

**自查**：桌面浏览器验不出这个 bug（设备相关），修完标记「待 Ann 手机实测」，不阻塞后续任务。

---

# 任务 4（反馈5）私聊 toast 文案按真实发送情况

**现状**：`apps/SocialApp.tsx` 搜锚点 `五修-7 + 六改-6：私聊消息落主聊天`（约 L1420），L1429 的 toast 写死「（没发在评论区）」——但同一角色同一轮可能既有公开评论（json 里另一条 entry）又有私聊，写死文案与事实不符。

**修法**：
1. for 循环（`for (const pm of privateMessages)`）之前建名单：

```ts
const publicCharIds = new Set(newComments.map(c => c.authorCharId).filter(Boolean) as string[]);
```

2. toast 按四态改写（文案照抄）：

```ts
const alsoPublic = publicCharIds.has(pm.charId);
addToast(pm.lines.length > 1
    ? (alsoPublic ? `${charName} 私聊连发了 ${pm.lines.length} 条，也在评论区发了言` : `${charName} 私聊连发了 ${pm.lines.length} 条（没发在评论区）`)
    : (alsoPublic ? `${charName} 私聊了你一句，也在评论区发了言` : `${charName} 私聊了你一句（没发在评论区）`), 'info');
```

**自查**：搜 `没发在评论区`——只出现在 `!alsoPublic` 的两个分支里。

---

# 任务 5（反馈6）路人头像固定（同名同头像）

**根因（已核实）**：两处 dicebear 的 seed 掺了 `Math.random()`，同一路人名每次生成新 seed → 新头像：
- L675（刷新推荐流·路人帖）：`seed=${item.authorName + Math.random()}` 且样式 4 选 1 随机，且**没 encodeURIComponent**；
- L1403（搅动·路人评论）：`seed=${encodeURIComponent(author.name + Math.random())}` 样式也随机。
（L816 首次评论路径本来就是 `seed=${authorName}`，稳定，不动。）

**修法（两处同款）**：
1. seed 只用名字：`seed=${encodeURIComponent(名字)}`（L675 补上 encode）。
2. 样式不再随机，按名字字码和取模固定（名字相同 → 样式相同）：

```ts
const styleIdx = [...名字].reduce((s, ch) => s + ch.codePointAt(0)!, 0) % 4;
```

样式数组保持原地顺序（`['micah', 'avataaars', 'bottts', 'notionists']` / `seeds`）。

3. 存量已存评论/帖子的头像 URL 不回填——本修只影响新生成的。

**自查**：搜 `Math.random() * seeds.length` 与 `author.name + Math.random()`——应零命中；`item.authorName + Math.random()` 同零命中。

---

# 任务 6（反馈8）「N 条新动静」数量改为按实际合并差值

**排查记录**：toast 现在引用解析数组 `newComments.length`（L1440），本身与入库一致；「数量大于实际」两个来源：(a) 模型复读式输出——条数真实增加但视觉上像没有新评论（任务 1/2 的 prompt 定稿落码后会大幅缓解）；(b) 聊天侧「新动态」卡的 `newComments` 按 seen 名单差集计算（updatePostInFeed 内，约 L542），若旧数据 seen 名单迁移有漏会把旧评论当新评论通知——**需实锤，本轮先加观察日志**。

**修法**：
1. `apps/SocialApp.tsx` 搜锚点 `addToast(\`评论区有 ${newComments.length} 条新动静\``（约 L1436-1441），改为按合并前后实际差值：

```ts
const merged = updatePostInFeed(post.id, current => ({
    ...current,
    comments: mergeSocialComments(current.comments || [], newComments),
}));
const added = (merged?.comments?.length ?? existing.length) - existing.length;
if (added > 0) {
    addToast(`评论区有 ${added} 条新动静`, 'info');
} else if (!privateMessages.length) {
    addToast('这段时间评论区没什么动静', 'info');
}
```

（原 `if (!newComments.length && !privateMessages.length)` 没动静分支被上面的 else-if 取代；`existing` 变量在 L1379 已有。）

2. updatePostInFeed 的追踪通知路径（搜锚点 `帖子追踪：已通知名单里没有的评论 id`，约 L534-552）`if (newComments.length)` 里加一行观察日志：

```ts
console.debug('[Spark][追踪通知]', postId, { seenCount: seen.length, newIds: newComments.map(c => c.id) });
```

（Ann 复检再遇数量不符时，把这行 console 输出发回来定位 seen 迁移问题，届时另开小修，不在本轮扩大战线。）

**自查**：toast 数字来源不再是 `newComments.length`；日志行只在追踪通知命中时打印。

---

# 任务 7（反馈9 · Ann 拍板 B）内容全空 → 整张同步卡删除

**位置**：`apps/SocialApp.tsx` `syncPostSnapshotToChats`（搜锚点 `六改-4a：同步名单`，约 L1055）。

**修法**：函数拿到 post 后先判空：

```ts
const emptied = !(post.content || '').trim() && (post.comments || []).length === 0;
```

- `emptied === true`：对该角色名下所有匹配卡（筛选条件不变：`m.type === 'social_card' && (m.metadata as any)?.post?.id === postId`）逐张 `await DB.deleteMessage(card.id)`——**真删，整张卡从聊天里消失**，不再走 updateMessageMetadata 更新成空快照。
- 否则走原有 updateMessageMetadata 逻辑，一字不动。

（`DB.deleteMessage` 的调用姿势参照 apps/Chat.tsx 约 L2883 的 `await DB.deleteMessage(deletedId)`。）

**自查**：删光某帖的正文+全部评论 → 对应角色聊天里该帖的同步卡整张消失；只删部分评论 → 卡仍在、newComments 按现存评论过滤（原有行为不回退）。

---

# 任务 8（反馈3）评论改为原位编辑框（去掉 window.prompt）

**现状**：`apps/SocialApp.tsx` `handleEditComment`（搜锚点 `五修-2：编辑任意帖子下的任意评论`，约 L1128）用 `window.prompt`——手机浏览器原生弹框输入不便。

**修法**：
1. 组件加状态：`const [editingComment, setEditingComment] = useState<{ id: string; draft: string } | null>(null);`
2. 现有「编辑」按钮的调用处（搜 `handleEditComment` 的 onClick 调用点，在评论行操作区）改为：`onClick={() => setEditingComment({ id: c.id, draft: c.content })}`。
3. 评论渲染处（顶层评论与楼中楼共用同一渲染块，搜锚点 L1689 一带的 `回复`按钮所在行）：`editingComment?.id === c.id` 时，在该评论正文位置渲染原位编辑态——
   - textarea：`value={editingComment.draft}`、`onChange` 写回 draft（setEditingComment 不可变更新）；样式贴评论弹层输入框基调（`border border-[#EDEDED] rounded-[12px] text-[15px] p-2 caret-[#FF2442] bg-white w-full resize-none outline-none`，尺寸自适应评论气泡）；
   - 下方两个小胶囊按钮：`保存`（主色 #FF2442 白字）与 `取消`（灰边）。
   非编辑态渲染原样，零改动。
4. `handleEditComment` 重写为 `saveEditingComment(post)`：读 editingComment → trim → 空或与原内容相同则直接 setEditingComment(null) 返回 → `updatePostInFeed` 里 map 替换该评论 content（原 L1133-1136 逻辑照搬）→ `addToast('回复已修改', 'success')` → `trackEvent('编辑 Spark 评论')` → `await syncPostSnapshotToChats(post.id)` → `setEditingComment(null)`。取消按钮 = `setEditingComment(null)`。
5. 弹层收起（closeComposer）或切换帖子（handleClosePost）时 `setEditingComment(null)` 复位，防悬空编辑态。

**自查**：编辑→保存→评论区原位更新、聊天快照卡同步更新；取消不动；楼中楼里的评论同样能原位编辑；`window.prompt` 在全文件应零残留（搜 `修改这条回复`）。

---

# 任务 9（反馈11）封面 emoji 乱码（「OPCOR」之类字母/编号）

**根因（已核实）**：AI 生成帖子时 `emojis` 字段偶尔输出垃圾字符串（如 `OPCOR`）；`codepointToEmoji` 对非十六进制输入「原样直通」（本意是放过真 emoji 字符），垃圾字母串就当文字显示在封面上。

**修法**：`apps/social/SparkPostImage.tsx` `codepointToEmoji` 的直通分支（L13 `if (!/^[0-9a-fA-F-]+$/.test(code)) return code;`）改为：

```ts
if (!/^[0-9a-fA-F-]+$/.test(code)) {
    // 真 emoji 字符直通；混着 ASCII 字母/数字的垃圾串（如 "OPCOR"）→ 兜底 ✨
    return /[0-9A-Za-z]/.test(code) ? '✨' : code;
}
```

（一处修，帖子封面 / 聊天 social_card 卡 / TokenImg 头像兜底三条渲染路径全吃到——它们都走 codepointToEmoji。）

**自查**：`codepointToEmoji('OPCOR') === '✨'`、`codepointToEmoji('🎉') === '🎉'`、`codepointToEmoji('1f388') === '🎈'`（可在 vitest 里加一条小测试，或 console 验证后删掉临时代码）。

---

# 任务 10（反馈10）长按删除 Spark 卡 = 真删除——**排查结论，零改动**

Ann 实测有长按菜单且能删，问的是「真删上下文还是只前端删」。**答案：真删**，无需施工。证据链（都已核实）：

- `components/chat/MessageItem.tsx` commonLayout 的内容包装层挂了 `{...interactionProps}`（约 L2021），social_card 三种卡（分享卡/公开足迹卡/新动态卡）都经 commonLayout 渲染 → 长按手势本来就在。
- 长按菜单的删除走 `apps/Chat.tsx` `handleDeleteMessage`（约 L2880）：`await DB.deleteMessage(deletedId)` **真删 IndexedDB**，随后 `markAmsgStateDirty` 打脏云端主动消息快照（角色到点不会重提已删消息）；多选批量删除（约 L3048）同样走 `DB.deleteMessages`。
- 聊天上下文每轮从 DB 读 → 删掉的卡不再进任何上下文。
- 唯一「又出现」的情况：帖子有新评论时追踪逻辑会**新建**「新动态」卡（约 L544-546）——那是新通知不是复活，属设计内。

flash 本任务零改动。

---

# 任务 11（反馈1）谷歌模型 400 高概率——**不施工，等实锤**

**已核实的事实**（别再往私聊片段上猜——Ann 已否：主聊天全量私聊上下文不炸）：
- 全库没有任何 `safetySettings` 相关代码——主聊天与 Spark 评论生成走同一条 API、同样的安全默认值，不存在「Spark 少带安全参数」的差异。
- 触发点在 Spark 评论生成 prompt 的特定内容/结构上（时好时坏=内容相关），具体哪一段必须看 **400 响应体原文**。

**下一步**：Ann 下次遇到报错时，把 toast「评论区模拟失败: HTTP 400: …」冒号后面那串完整文字发回来（`apiErrorMessage` 已把响应体前 180 字放进 toast，SocialApp L26-39）。拿到原文再对症定修法。任务 1/2 的 prompt 定稿落码顺带可能缓解，先观察。

flash 本任务零改动。

---

# 完工三验收（同 v7）

1. `node node_modules/typescript/bin/tsc --noEmit` → 基线 47 历史错误，改动文件 0 新增。
2. `pnpm vitest run` → 历史遗留挂的不算，Spark 相关全过。
3. `pnpm build` → 通过。worker.bundle.js 重生成后若与本轮无关则还原。

**验收完停在 commit 前**，报 Ann：改动文件清单、验收数字、复检要点。等她点头才 commit。

# Ann 手机复检清单（完工后转给她，地址 http://10.48.18.221:5188/ 硬刷新）

1. 搅动/首次评论：路人评论多数就帖论帖，不再挖人物关系；帖子里的老面孔路人带新东西说话，不再复读。
2. 评论弹层：打开后直接打字就能显示（vivo），不再需要点一下 @ 才正常。
3. 搅动出私聊：角色也公开发了评论时 toast 说「也在评论区发了言」；没公开发言时才说「没发在评论区」。
4. 同名路人跨多次搅动/刷新，头像不变。
5. toast「N 条新动静」与评论区实际新增一致；若聊天「新动态」卡数量仍虚高，把 console 里 `[Spark][追踪通知]` 那行发回来。
6. 删光帖子正文+全部评论 → 聊天里对应同步卡整张消失。
7. 评论编辑：点编辑 → 原位出编辑框 → 保存/取消都正常（含楼中楼）。
8. AI 帖子封面不再出现「OPCOR」之类字母/编号，垃圾值显示 ✨。
9. （回归）v7 八条清单功能不回退：@ 全员可点真通知、水位 id 制通知不漏不重、私聊开关、删评同步、@ 名单清理等。
10. 400 报错若再遇到：把 toast 完整文字记下来发回来。

# 事故备忘（同 v7，踩过的坑）

- 公司机 shell 命令前加 `export PATH="/c/Program Files/Git/usr/bin:$PATH"`；开头的 dirname/cd 报错是 shim 噪音，无害。
- 这台机 git 引用「落地即被吞」：fetch/commit 后立刻 `git pack-refs --all --prune`；发现指针回退就用文件工具直写 ref 文件再 pack；push 前后 `git log -1` 验证；网络不通挂 `git -c http.proxy=http://127.0.0.1:7890`。
- 任何 checkout/restore 后必须 `git status` 验收。
- dev server 不许自行停/重启（跑在 5188，Ann 存档所在源）。
- WORKLOG.md 完工后在本文件同目录顶部追加一节（改动文件清单+验收数字+复检清单引用）。
