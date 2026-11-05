# 表情包权限管理（长按分组直达）

2026-11-05 定案。长按私聊/群聊表情面板里的任意分组标签 → 直接打开「表情包权限」管理页；中间不弹任何小菜单。

## 界面与操作

- **总览**：每个分组一张卡片。卡片上有分组名、状态角标（全员可用 / N 个角色不能用 / 只有我能用 / 有表情被屏蔽 / 已折叠）、能用的角色头像（亮 = 能用，灰 = 不能用）、右上角折叠开关。点卡片进入该分组。
- **分组详情**：开「只有我能用」；每个角色一个「谁能发」开关（默认全开）；改名、删除分组、下载原图。
- **长按单个表情**（私聊面板）→ 现有「表情包操作」菜单多一行：不给当前角色用 / 让当前角色重新能用。在谁的私聊里按的，就对谁生效。
- **折叠**：折叠开关跟着聊天窗口走。私聊按角色 id 记、群聊按 `group:<groupId>` 记。折叠的分组收进面板上的「已折叠 N 个」，点开随时展开；不进快速发送（面板直发和打字联想都排除）。「默认」分组永远显示、不能折叠，保证随时有分组可长按。

## 权限规则

- 分组对角色默认全开；关掉的记在分组的 `blockedCharacterIds`。
- 旧数据里的 `allowedCharacterIds` 名单自动换算：名单里的角色亮、名单外的灰，效果跟以前一样。只要分组上有 `blockedCharacterIds`（哪怕空数组），就以新记录为准；用户拨动开关后写新记录并清掉旧名单。
- 「只有我能用」= 所有角色都不能发，用户自己照常能用。
- 单表情屏蔽记在表情的 `blockedCharacterIds`，只在分组开关亮着时生效。
- 已删除的角色：换算时只认现存角色，自动不出现，不写迁移。
- 统一换算入口：`utils/emojiPermissions.ts`。AI 提示词、云端主动消息清单、群聊分发、面板显示都走这一份，不许各算各的。

## AI 侧

- 私聊：`ChatPrompts.filterVisibleEmojis` 已改为调用统一换算（分组开关 + 旧名单 + 单表情屏蔽 + 只有我能用）。主动消息的打包与收侧（activeMsgClient / activeMsgRuntime）、本地主动消息（OSContext）、挂断补句、协同、陪看都复用它。
- 提示词规则：只能从清单里挑表情；清单里没有的不能发；对话记录里出现过但已不在清单里的也不能再发；不许编造。
- 群聊：清单 = 所有成员都能用的公共清单 + 仅个别成员可用的名字后加「（仅角色名）」标注。群聊分发落库时按发言角色自己的权限反查 URL；找不到就跳过（维持现状）。
- **猫儿小助手修表情包**：始终拿全量表情库和全部分类，不受权限过滤。

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
- 测试：`utils/emojiPermissions.test.ts`、`utils/emojiBackupCompat.test.ts`、`utils/groupChat/prompts.emojiPermissions.test.ts`、`utils/chatPrompts.emojiRule.test.ts`。
