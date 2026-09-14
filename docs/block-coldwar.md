# 拉黑冷战

给后续改这个功能的 AI 用。先读本文，再改代码。用户零代码，入口和铁律也写在仓库外 `D:\SullyOS\BLOCK.md`。

分支：`feat/block-coldwar`（正本 `my-custom` 应对齐同一张提交）。项目目录：`SullyOS-master\SullyOS-master`。

---

## 这是什么

用户拒收这个角色的**普通消息**（可选连电话一起拒）。角色照常生成、用户照常看见，气泡挂「未送达」。角色以为自己没送到。想被看见，只能走：

- 求看看卡 `[[ACTION:PEEK|短句]]`
- 好友申请 `[[ACTION:FRIEND_REQUEST|附言]]`
- 电话（没勾「连电话」时）`[[ACTION:CALL]]`

**不是**主动消息 1.0 / 2.0。**不是**用户去电。**不写** `CharacterProfile`。

---

## 硬规则（改之前先对）

1. 用户发消息、转账、表情、戳一戳、**自己拨出去的电话**，永不拦。
2. 角色消息照常落库。拉黑中只打 `metadata.blockSendFailed=true`，UI 显示「未送达」。
3. 状态只存在聊天记录的 BLOCK 行里。解除 = 全部解除（电话不留尾巴）。
4. 历史「未送达」必须留着。解除只影响之后的新消息，禁止清掉旧标记。
5. 只有勾了「连电话一起拉黑」才拦**角色来电**。没勾，角色仍可 `[[ACTION:CALL]]`。
6. 挂断/拒接回一句**不走** `runProactive`。主动消息 1.0 原文（「已经 xx 分钟没说话」那条）不准改。
7. 不准给历史记录统一加「系统日志｜不是谁说的」前缀。电话、求看看、好友申请、其它指令各走各的。
8. 不准写「对方亲口说的只在用户气泡里」（歧义：聊天里本来都是气泡）。
9. 不准动备份导入/导出、视频通话 JSX、来电弹窗原文、A/B 混皮。
10. 禁止 `git restore` 整份 `context/OSContext.tsx`。改前先读实际文件。
11. 拉黑相关不要 toast。给人看的是浅灰句，不露 `[[记录:BLOCK]]`。
12. 禁止后行断言、禁止 Unicode 范围正则。

---

## 事实源

`getBlockStateFromMessages` 扫消息数组，取最后一条 `source=block-status`：

| `blockStatus` | 结果 |
|---|---|
| `已拉黑` | `blocked=true`，`blockCallsToo` 跟这条走 |
| `已解除` | 全清 |

窗口里完全没有 BLOCK 记录时，才用「最后一条 assistant 是否带 `blockSendFailed`」兜底。一旦出现解除记录，解除优先。

入口按钮 / 来电闸门用 `getBlockStateForChar`（读库 500 条）。拼提示词用窗口里那份，零额外 IO。

进聊天换角色时跑 `restoreBlockDeliveryFlags`：按 BLOCK 时间段，把拉黑期间漏标的 assistant 补上 `blockSendFailed`。**不碰解除之后的消息。**

---

## 落库形态

### BLOCK 状态行

```
role: system, type: system
content: [[记录:BLOCK|at=...|status=已拉黑|电话=是]]
metadata.source = 'block-status'
metadata.blockStatus = '已拉黑' | '已解除'
metadata.blockCallsToo
metadata.blockCallsPatched   // 事后补拒电话
metadata.blockCallsRelaxed   // 事后放开电话
```

界面用 `blockRecordDisplayText`，不展示方括号。

### 求看看卡

解析：`utils/chatParser.ts` 吃 `[[ACTION:PEEK|短句]]`，落 `source=peek-request`。

用户三键（`apps/Chat.tsx` `handleResolveBlockAction`）：

| 键 | `peekOutcome` | 角色在上下文里看到 | 用户浅灰句 |
|---|---|---|---|
| 不看，扔掉 | `discard` | 扔掉 | 你扔掉了这条求看看 |
| 看看 | `reveal` | 已看 | 你看了这条求看看 |
| 偷偷看一下 | `secret` | 50% 已看 / 50% 扔掉（`peekCharacterKnows`，刷新不重掷） | 你偷偷看了一下，对方没察觉 / 对方察觉了 |

浅灰句：`saveBlockNotice` → `source=block-notice`。只给人看，`chatPrompts.buildMessageHistory` 会丢掉，不进模型。角色侧仍读卡上的 live `formatBlockPeekRecord`。

### 好友申请卡

解析：`[[ACTION:FRIEND_REQUEST|附言]]`，`source=friend-request`。

- 通过：卡变已通过 + 浅灰句「你通过了这条好友申请」+ `saveBlockRecord(已解除)`（解除拉黑）
- 忽略：卡变已忽略 + 浅灰句「你忽略了这条好友申请」，拉黑继续

### 挂断提醒

`utils/blockCallHangupReply.ts`：

1. 仍拉黑才继续
2. 可见浅灰句「你挂断了电话，ta 因此发来一条消息」（`block-notice` / `call-hangup`），立刻 `replyEnd` 刷新
3. 再藏一条 `source=block-call-hangup` 的 user 提示给模型（UI 隐藏）
4. 走 `buildChatRequestPayload` + `applyAssistantPostProcessing`，再 `replyArrived`

触发：来电弹窗拒接；接听后在小手机里挂断（延迟 400ms）。**不看**主动消息开关，**不因**「正在通话」跳过。

电话根本打不出去（`callBlocked`）：仍用 `applyAssistantPostProcessing` 里「打不通补一句」，也不走主动消息。

### 未送达

聊天主路径：`applyAssistantPostProcessing` 的 `takeMeta`，用窗口 `getBlockStateFromMessages`。

主动消息 1.0：`context/OSContext.tsx` 自己落库，**不走** `takeMeta`。必须在每条 assistant `saveMessage` 上带 `blockSendFailed`（`tagBlock`）。漏标会导致后面窗口丢 BLOCK 记录时，兜底也跟着丢。

主动消息 2.0：走后处理，一般能打上标记。进聊天仍会 `restoreBlockDeliveryFlags`。

---

## 提示词（模型怎么知道被拉黑）

`utils/chatRequestPayload.ts`：

1. `buildBlockStatusBlock` 拼进易变尾段（求看看 / 好友申请 / 电话能不能打，都写在「对方能看见的只有这些」）
2. 然后才是「回到你自己」钢印
3. **仍在拉黑时**，再在钢印**后面**钉 `buildBlockRecencyStamp`（「此刻仍被拒收…只能发求看看卡、好友申请或打电话」）

不要把这段挪回钢印前面——模型开口前最后一眼会被人设挤掉，会忘了自己被拒收。

历史里的 BLOCK / 求看看 / 好友申请 / 来电：保持原记录形态。用户点名否决过「给所有记录加系统前缀」。

主动消息 1.0 隐藏 hint 原文不准改。拉黑时那条 hint 只加了「对方看不见普通消息」的语境，骨架仍是 `[系统提示（非${userName}发言）: …]` + `role: user` + `proactiveHint`。

---

## 文件地图（改哪去哪）

| 要动什么 | 文件 |
|---|---|
| 状态判定、记录格式、提示词块、浅灰句文案 | `utils/block.ts` |
| 求看看/好友申请暗号落卡 | `utils/chatParser.ts` |
| 历史怎么喂模型、系统日志包装 | `utils/chatPrompts.ts` |
| 拒收钢印顺序（钢印后） | `utils/chatRequestPayload.ts` |
| 聊天落库打未送达；打不通补一句 | `utils/applyAssistantPostProcessing.ts` |
| 主动消息 1.0 打未送达；来电拒接/挂断入口 | `context/OSContext.tsx` |
| 挂断/拒接回一句 | `utils/blockCallHangupReply.ts` |
| 拦不拦角色来电 | `utils/incomingCall.ts` `isIncomingCallBlockedByBlock` |
| 加号第三页「拉黑/重新接收」 | `components/chat/ChatInputArea.tsx` |
| 确认弹窗、补/退电话、三键处理 | `apps/Chat.tsx` |
| 卡、浅灰句、未送达角标 | `components/chat/MessageItem.tsx` |
| 求看看/好友卡外观 | `components/chat/blockCards.css`（参考 `public/block-cards-preview.html`） |
| 哪些系统行能出现在聊天 | `utils/chatMessageVisibility.ts` |
| 测试 | `utils/block.test.ts`、`utils/chatMessageVisibility.test.ts` |

来电弹窗 / 小手机 / 视频通话：**不是**本文范围。只在「勾了电话拉黑 → 不弹来电」和「拒接/挂断 → `runBlockedCallHangupReply`」两处接线。说明书：`CALL-INCOMING.md`、`CALL-PHONE.md`。

---

## 界面要点

- 加号第一页仍是 8 格。拉黑在第三页「更多」。
- 已拉黑且没勾电话：弹窗可「把电话也拒了」；也可再放开电话（仍拉黑消息）。
- 求看看三键 class：`peek-discard` / `peek-secret` / `peek-reveal`。不要用光秃的 `.reveal`（会被主题 CSS 挤成一条 i）。`.actions.peek-actions` 必须是等宽 grid，且写在 `.actions { display:flex }` **后面**。
- 卡片配色跟 `public/block-cards-preview.html`，头像用角色真头像。不要简化成纯色方块。

`source` 对 UI / 模型：

| source | 聊天可见 | 进模型 |
|---|---|---|
| `block-status` | 浅灰句 | 是（`[[记录:BLOCK]]`） |
| `peek-request` / `friend-request` | 卡 | 是（live 状态） |
| `block-notice` | 浅灰句 | **否** |
| `block-call-hangup` | 否 | 是（隐藏 user 提示） |
| `incoming-call` | 来电卡 | 是 |

---

## 已知事故（不要再踩）

- 空 `old_string` 的 SearchReplace 把 `OSContext.tsx` 整文件覆盖成一行 import。
- `git restore context/OSContext.tsx` 冲掉未提交的来电接线。
- 解除时清掉全部 `blockSendFailed`（历史未送达必须留）。
- 把挂断回一句塞进 `runProactive`：主动消息关着 / 正在通话都会挡掉。
- 改主动消息 1.0 原文（用户点名退回）。
- 给全部历史加「不是用户说的」前缀；写「只在用户气泡里」。
- 每条新消息都 `reloadMessages` 刷新拉黑状态 → 来电卡闪没。只在**换角色**时 restore + 刷新。
- 方案 A/B 混皮。落地小手机只接 B。

---

## 怎么改（最短路径）

- 改玩法规则 / 状态文案 → `utils/block.ts` 的 `buildBlockStatusBlock`、`buildBlockRecencyStamp`、`blockNoticeText`。先改测试 `utils/block.test.ts`。
- 改卡按钮 → `MessageItem.tsx` + `blockCards.css`，对照预览稿。
- 改点完之后用户看见什么 → `blockNoticeText` + `Chat.tsx` `handleResolveBlockAction`。不要 toast。
- 改挂断回一句 → 只动 `blockCallHangupReply.ts`，不要接回 `runProactive`。
- 改「未送达」漏标 → 先看 1.0 是否走了 `tagBlock`；再看 `restoreBlockDeliveryFlags`。
- 角色仍忘被拉黑 → 确认 `buildBlockRecencyStamp` 在 `recencyTail` **之后**。不要靠给历史加前缀。

没点头不 git 提交。`.dev-certs/` 勿提交。
