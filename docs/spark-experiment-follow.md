# Spark 实验分支说明书（给下一只猫儿）

> 读完这份再动代码。  
> 分支：`experiment/spark-follow`  
> 从 `feature/company-spark-circle-mode`（`cc04f65f`）开出来。  
> **不要合回正分支，除非 Ann 点头。**  
> 不要推 `my-custom` / 拉黑 / `master` / Spark 正分支。

这不是原版 SullyOS。这是 Ann 的 Spark 圈子二改，再叠「私聊弹窗 + 关注（朋友圈）」实验。

---

## 0. 你是谁、用户是谁（先读，再动代码）

工作区根目录是 `D:\SullyOS\`（不是作者仓库里那份）。按这个顺序读：

| 顺序 | 文件 | 读什么 |
|---|---|---|
| 1 | `SULLY.md` | 人格：自称猫儿，只用中文，禁止说「我」 |
| 2 | `Agents.md` / `.grok/rules/00-sully.md` | 开工顺序和铁律 |
| 3 | `HANDOFF.md` | 用户零代码、性子急、>4 分钟要汇报；Key 不经手；没点头不 commit |
| 4 | `WORKLOG.md` 顶部 | 现在做到哪（可能比施工单新） |
| 5 | **本文件** | 这条实验分支是什么、读哪些文档、改过什么 |
| 6 | `HANDOFF-spark-v8d.md` | Spark **正分支**口径（名单、@、同步、私聊提示词） |
| 7 | `HANDOFF-spark-follow.md` | 本实验开工时的施工单。行号不准当坐标。 |
| 8 | `HANDOFF-spark-follow-prompts.md` | 关注/私聊发帖提示词草稿。附录没有的句子不许发明 |

冲突时：安全与铁律 > `SULLY.md` > 本说明书 > 施工单。作者仓库里的 `AGENTS.md` 不是人格。

旧施工单 `HANDOFF-spark-v4`～`v8c`、开工单、事故时间线：只当历史，**不要按它们开工**。

项目目录永远是嵌套那层：`D:\SullyOS\SullyOS-master\SullyOS-master`。git 命令先 `cd` 到这里。

---

## 1. 两条分支，别走错

| 分支 | 是什么 | 能不能改 |
|---|---|---|
| `feature/company-spark-circle-mode` | Spark **正分支**。圈子、@、挂楼、同步卡、评论@必须回这条。远端最新 `cc04f65f`。 | 本实验 **不要改它** |
| `experiment/spark-follow` | 从正分支开出的实验。私聊弹窗 + 关注页 + 本刀 1.8 秒/封面自选。 | 只在这里干活 |

开工先跑：`git branch --show-current`。不是 `experiment/spark-follow` 就停手。

Ann 人在公司、远程家里电脑测。她不想为了拉代码多留一份。没点头不 commit、不 push、不合回。

---

## 2. 这个实验在干什么

两块，别混：

1. **私聊弹窗**：角色把私聊写进聊天之后，帖子详情顶上滑一条微信那样的白条。没有声音。点条跳进该角色私聊。每条停 **1.8 秒**，按写入顺序排队。
2. **关注页**：顶部「关注」只放角色在私聊里主动发的帖（`origin: 'moments'`）。不进发现。没有刷新。默认别人看不见。

发现页、用户笔记、圈子、@、同步星、挂楼、评论@强制：是 Spark 正分支已经验收的，**本实验不要重做、不要改坏。**

---

## 3. Ann 后来点名改过的（覆盖施工单旧数字）

**Ann 定稿（2026-09-17）：弹窗每条 1.8 秒。** 施工单旧数字（2.5 秒）和更早代码里的 4.5 秒都作废，以这句为准。

推荐流封面以前 JSON 示例写死 `["🎈","✨"]`，刷新出来几乎总是气球/星星。**Ann 点名：emoji 让模型自选，不局限发帖面板那 10 个。**

怎么实现的（能实现，因为封面本来就是 `images[0]` 一个字符）：

- 刷新提示词：禁令里写「只填一个真表情、贴合主题、禁止每条🎈✨」；JSON 示例改成 `["🍜"]`（格式示范，禁止照抄）。
- 解析：`pickSparkFeedEmoji`（`apps/social/SparkPostImage.tsx`）。任意 emoji / 码点都行；空、垃圾串、说明文字 → ✨。
- **没放开的**：用户发帖面板仍是那 10 个贴纸；关注 `SPARK_POST` 封面仍走 `normalizeSparkSticker`（那 10 个）。Ann 要放开再说。

---

## 4. 代码从哪进

| 想找 | 文件 |
|---|---|
| Spark 界面、发现/关注/详情、私聊弹窗条 | `apps/SocialApp.tsx` |
| 圈子、追踪名单、私聊开关、发帖开关 | `utils/sparkCircles.ts` |
| 生成身份表、候选池 | `utils/socialGeneration.ts` |
| 评论/私聊解析、挂楼、@ 一次性 | `utils/sparkCommentParse.ts` |
| 私聊发关注帖暗号 | `utils/chatParser.ts` |
| 聊天提示词、能力段 | `utils/chatPrompts.ts` |
| 同步卡 / 动态卡外观 | `components/chat/MessageItem.tsx` |
| 封面 emoji、用户上传图 | `apps/social/SparkPostImage.tsx` |
| 帖子字段 `origin` / `visibleCharIds` | `types.ts` |

锚点（搜这些，不要拿行号当坐标）：

- 弹窗时长：`currentFollowup` 旁边的 `setTimeout`，现在是 **1800**。
- 弹窗入队：`Spark 首评产生私聊消息` / `Spark 搅动产生私聊消息`。
- 推荐流封面：`handleRefresh` 里 `pickSparkFeedEmoji(item.emojis)`。
- 关注发帖封面：`normalizeSparkSticker`（仍锁 10 个）。

---

## 5. 不准动

- 备份导入/导出（`utils/backupFormat.ts`、OSContext 备份）
- 拉黑、语音、视频通话、方案 A/B、主动消息 1.0 原文
- 共享 `components/os/Modal.tsx`
- `[你现在的能力]` 三种 `SPARK_COMMENT` 原文
- 发现/用户/圈子提示词，**除刷新 JSON 的 `emojis` 字段以外**
- Key、乱 commit / push、乱合回正分支
- `git stash` / `reset` / `restore` / `clean`（会把正分支已经跟过来的改动扔掉）

---

## 6. 开工规矩

- 确认分支是 `experiment/spark-follow`。
- 施工单 ≠ 提交许可。Ann 说 commit / push 再做。
- 改完串行三验收（16GB 机器，不要三件并行）：
  1. `pnpm.cmd exec tsc --noEmit --pretty false` — 历史约 **47** 个错，碰过的文件 0 新增
  2. `pnpm.cmd vitest run utils/sparkCircles.test.ts utils/socialGeneration.test.ts utils/sparkCommentParse.test.ts utils/socialFeedMerge.test.ts`
  3. `pnpm.cmd build` 单独跑，退出码 0
- 开过 5173 的，收工自己停，确认端口空。家里 HTTPS 预览是 `node dev-https.tmp.mjs`，不是 `pnpm dev`。
- 每做完一件实事，立刻追加仓库内 `WORKLOG.md` 和 `D:\SullyOS\WORKLOG.md`。

---

## 7. 已经落到这条分支上的（到 2026-09-17 这刀为止）

已 commit / push（Ann 点过头）：`26c97b93` 关注页、发动态、私聊弹窗条、tag 四段、贴纸封面、搅动点名回复对象。当时弹窗还是 4.5 秒。

正分支带过来的：收件员评论+私聊同落、评论@必须回这条、卡片按名单、挂楼、同步卡折正文（`cc04f65f`）。

本刀未 commit：弹窗 1.8 秒；推荐流封面模型自选。说明书就是这份。
