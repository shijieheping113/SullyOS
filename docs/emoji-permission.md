# 表情包权限管理（长按分组直达）

2026-11-05 定案。长按私聊/群聊表情面板里的任意分组标签 → 直接打开「表情包权限」管理页；中间不弹任何小菜单。

## 界面与操作

- 长按私聊/群聊表情面板里的任意分组标签 → 直接打开「表情包权限」小窗（原版居中弹窗，不再全屏，也没有第二层页面）。中间不弹任何小菜单。
- 一页里每个分组一张小卡：
  - 左边是这个分组的第一张表情预览；名字下面写明「N 个表情 · 全员可用 / N 个角色不能用 / 只有我能用 / 已折叠」。
  - **头像就是权限开关**：亮 = 这个角色能用，点一下变灰 = 不给这个角色用，再点回亮。
  - 「只有我能用」「折叠」是两个胶囊按钮，点一下开、再点一下关，不用滑块。
  - 铅笔 = 名字当场变输入框；下载 = 导出这个分组的原图；垃圾桶 = 卡片里直接问「删掉分组和里面的表情？」。
  - 「默认」分组不显示折叠；整组只保留用户自己可见、可发。
- **长按单个表情**（私聊面板）→ 现有「表情包操作」菜单多一行：不给当前角色用 / 让当前角色重新能用。在谁的私聊里按的，就对谁生效。
- **折叠**：跟着聊天窗口走。私聊按角色 id 记、群聊按 `group:<groupId>` 记。折叠的分组收进面板上的「已折叠 N 个」，点开随时展开；不进快速发送（面板直发和打字联想都排除）。「默认」分组永远显示、不能折叠，保证随时有分组可长按。
- 弹窗内容是「无可见滚动条」的（沿用项目 `.no-scrollbar`）：分组多时仍可滑动，但不会出现那条横/竖滚动条。

## 权限规则

- 分组对角色默认全开；关掉的记在分组的 `blockedCharacterIds`。
- 旧数据里的 `allowedCharacterIds` 名单自动换算：名单里的角色亮、名单外的灰，效果跟以前一样。只要分组上有 `blockedCharacterIds`（哪怕空数组），就以新记录为准；用户拨动开关后写新记录并清掉旧名单。
- 「只有我能用」= 所有角色都不能发，用户自己照常能用。
- 单表情屏蔽记在表情的 `blockedCharacterIds`，只在分组开关亮着时生效。
- 已删除的角色：换算时只认现存角色，自动不出现，不写迁移。
- 统一换算入口：`utils/emojiPermissions.ts`。AI 提示词、云端主动消息清单、群聊分发、面板显示都走这一份，不许各算各的。

## AI 侧

### 折叠和权限是两件不相干的事

- **权限**：这个角色能不能用某个表情。记在分组的 `blockedCharacterIds` / `userOnly`、以及单表情的 `blockedCharacterIds` 上。**只有权限决定角色能发什么。**
- **折叠**：我在这个聊天窗口里把某个分组收起来、暂时不点。记在窗口上（私聊按角色 id、群聊按 `group:<groupId>`）。它是**我自己面板的收纳习惯**，不是权限、不是禁令，**不改变任何角色能发什么**（Ann 2026-11-06 定）。

### 两份数据，各管一件事（别混用）

| 谁在用 | 拿哪一份 | 结果 |
|---|---|---|
| **角色**读聊天记录时认图（也用于界面把消息里的表情画出来） | **全本表情库**：库里所有表情，不看权限、不看折叠 | 谁发的、什么表情，都认得出 |
| **角色**自己看「我能发哪些」的那份提示词清单 | 权限过滤后的清单（折叠不参与） | 它这轮能发什么，跟权限严格对应 |
| **系统**在角色说完话后，按名字去找图片落库 | 权限过滤后的清单（折叠不参与） | 角色真发出来的表情，一定找得到图 |

- **认图必须用全本表情库**：聊天记录里的表情消息只存图片地址（`content` 是 url 或 blob 令牌），要靠全本 `emojis.find(e => e.url === url)` 才查得回名字。用过滤后的清单，「只有我能用」的表情会变成「未知表情」，角色等于没看见用户发了什么。载荷层为此有独立字段 `historyEmojis`，只喂 `buildMessageHistory`，**禁止流向提示词与发送反查**。
- **折叠不进任何发给角色的清单**：无论私聊、群聊、协同、陪看、主动消息、挂断补句，清单都只按权限收口；`ChatPrompts.filterVisibleEmojis` 只收 `(emojis, categories, charId)` 三个参数，没有窗口/折叠参数。折叠只经 `userVisibleCategories` / `userVisibleEmojis` 作用于用户自己的面板与快速发送。
- 私聊：`ChatPrompts.filterVisibleEmojis` 调用统一换算（分组开关 + 旧名单 + 单表情屏蔽 + 只有我能用）。主动消息的打包与收侧（activeMsgClient / activeMsgRuntime）、本地主动消息（OSContext）、挂断补句、协同、陪看都复用它。
- 提示词规则（三处同义）：上下文里出现过的表情不等于现在能用，权限一直在更新；只能用清单里列出的名字，清单外的别学、不能自创、不能乱抄、不许编造。
- 群聊：清单 = 所有成员都能用的公共清单 + 仅个别成员可用的名字后加「（仅角色名）」标注。群聊分发落库时按发言角色自己的权限反查 URL；找不到就跳过（维持现状）。群聊历史的认图一直是全本。
- 协同窗口：显示层用全本（表情按名字存，要认得出所有名字）；能发什么由 `features/collaboration/context.ts` 按权限收口。
- 陪看：面板读全本、再按当前角色的折叠收敛（跟私聊看到的一致）；角色发过的表情用全本认 URL，永远显示得出来。
- **猫儿助手（加泡 / 修格式）**：始终拿全量表情库和全部分类，不受权限过滤。它是修格式的工具，所有显示得出来的格式都要能修。

## 渲染与降级（维持现状）

- 已经发出去的表情消息：聊天记录里存的是图片地址，渲染不查权限，永远能看。
- 新生成的回复里出现不能用的表情名：私聊 / 云端主动消息落一条文字气泡「[表情：名字]」；群聊直接不出现。

## 备份

- 权限字段挂在分组 / 表情对象上。作者备份按整个对象导出与写回，代码一行不改：表情不丢、权限跟着走；旧备份没有新字段时按旧名单换算。
- `utils/emojiBackupCompat.test.ts` 钉住整对象存取不丢字段。

## 改动文件

- `types.ts`：`EmojiCategory` 增加 `blockedCharacterIds` / `userOnly` / `foldedIn`；`Emoji` 增加 `blockedCharacterIds`。
- `utils/emojiPermissions.ts`：唯一换算入口与写入 helper。
- `components/chat/EmojiPermissionManager.tsx`：权限管理页。
- `apps/Chat.tsx`：长按分组直达、面板按折叠过滤、AI 过滤改走统一换算、表情菜单加一行、权限改动触发云端重打包。
- `components/chat/ChatInputArea.tsx`：分组长按直达、已折叠胶囊与展开、小锁判断改按新权限。
- `components/chat/ChatModals.tsx`：旧的分组操作 / 可见范围弹窗退场；表情操作菜单加「不给当前角色用」。
- `apps/GroupChat.tsx`：群聊面板折叠、长按直达管理页、成员权限清单。
- `utils/chatPrompts.ts`：过滤收口 + 提示词短规则。
- `utils/groupChat/prompts.ts`：群聊清单（公共 + 专属标注）。
- `utils/groupChat/dispatch.ts`：表情落库按角色权限。
- `utils/db.ts`：新增 `saveEmojiRecord`（整条表情记录写入，保留屏蔽字段）。
- `utils/chatRequestPayload.ts`：`historyEmojis`（只给认图，全本）。
- `utils/reprocessChatMessage.ts`：删掉旧的 `filterEmojisForChar`（只认 allowedCharacterIds）；重建已有消息时按调用方传入的库还原，不再二次收口。
- `apps/watchAlong/WatchAlongApp.tsx` / `components/watchAlong/WatchChat.tsx`：陪看读全本，面板按当前角色的折叠收敛。
- `features/collaboration/CollaborationWindow.tsx` / `features/collaboration/context.ts`：协同显示层传全本、能发什么只按权限收口。
- `utils/activeMsgClient.ts` / `utils/blockCallHangupReply.ts` / `context/OSContext.tsx`：认图用全本，清单与落库只按权限。
- 测试：`utils/emojiPermissions.test.ts`、`utils/emojiBackupCompat.test.ts`、`utils/groupChat/prompts.emojiPermissions.test.ts`、`utils/chatPrompts.emojiRule.test.ts`、`utils/chatRequestPayload.test.ts`、`utils/emojiPermissionWiring.test.ts`。
