> # SullyOS 二改小抄（定制版，二改工作只认这一块）
>
> 本文件是**两截拼起来的**：上半截到这里为止＝二改小抄（给干二改活的 AI 看）；从下面「# AGENTS.md」起是**原项目作者**的开发导航（文档地图），跟二改做了什么无关。
> **拉上游更新时，这一整块小抄和下面作者部分都要原样保留**；二改的东西不许塞进下面那张表。
>
> ## 一 · 二改新增（一簇一行，以 `git diff --name-status upstream/master...HEAD` 核对，总共 398 个新增文件，下面只列大件）
>
> **新 App**
> - `apps/miaomiaoBox/` + `context/MiaomiaoBoxContext.tsx` —— 「喵喵盒」：聊天加号里的小演出浮窗（独立 store，过程不写主聊天，合盖四选一才落 `box_record` 归档卡；章节名/总结走二级 API）
> - `apps/LiveStreamApp.tsx` + `components/live/`（11 件） + `utils/liveStream*` —— 「电波直播」：多频道 NPC 主播 + YouTube 房 + 博主 VOD 投稿 + 双人接龙；弹幕/SC/礼物/跟读/壁纸
> - `apps/watchAlong/` + `components/watchAlong/`（11 件） + `utils/watchAlong/` —— 「陪看」：大厅/房间/连麦席/导演/历史/总结
>
> **聊天族**
> - `components/chat/Sully*`（9 件） + `utils/sully*`（16 件） + `utils/secondaryLlmApi.ts`、`secondaryLlmCall.ts` + `components/settings/SecondaryLlmSettings.tsx` —— 「猫儿小助手」：修格式/加泡/重排（走**二级 API**，AI 修命令体、不带对话消息）；二级 API 是二改所有副业 LLM 活的通道（喵盒总结、宫殿压缩等）
> - `components/chat/ChatInnerStatePeek*.tsx` + `utils/innerStatePeek.ts`、`chatInnerPeekScroll.ts`、`chatEmotionView` —— 私聊里的「心里话/情绪卡」（翻面色卡）
> - `components/chat/ChatGame*` + `utils/chatGames/` + `settings/ChatGamesSettings.tsx` —— 聊天小游戏（骰子、三种出拳、角色落子）
> - `components/chat/ChatVideoSendSheet.tsx`、`VideoMessageBubble.tsx` + `utils/videoApi*`、`videoCoverFrame`、`videoShareNote`、`videoChatPrompt` + `settings/VideoUnderstandingSettings.tsx` —— 视频消息 + 本地视频理解（异步识别/费用统计）
> - `components/chat/XSocialCard.tsx` + `utils/xJpPack.ts`、`xSocialFetch.ts`、`jpHotClient.ts` + `worker/xJpRealtime.js` —— X/Threads 贴链卡 + 日本热词（端点部署在自己的 Worker）
> - `components/chat/EmojiPermissionManager.tsx` + `utils/emojiPermissions.ts` —— 表情包权限（按角色开关/只有我能用/分窗折叠；**唯一换算入口**）
> - `utils/chatNotify.ts`、`chatNotifySettings.ts` + `settings/ChatNotifySettingsCard.tsx` —— 私聊后台系统通知（点通知跳回该角色）+ 分段播报自检
> - `utils/bilingualMarker`、`parenTranslation`、`translateSession`、`webGoogleTranslate`、`voiceLangTranslate`、`globalTranslateSettings` + `GlobalTranslateSettingsCard.tsx` —— 翻译族（双语气泡 `%%BILINGUAL%%`、气泡下中文、心象、语音外语、全局开关）
> - `utils/thinkingEffort.ts`、`inlineThinkTags.ts` —— 思考强度 + 行内思考标签
> - `components/chat/BubbleInlineTime.tsx` —— 气泡内时间戳（「每条都显示/气泡内」）
> - `utils/reprocessChatMessage.ts` —— 已发消息重处理（表情重认走全本，不再二次收口）
> - `components/chat/appearance/Atelier*` + `utils/atelierComponentCss`、`atelierNavigation` —— 聊天「装修间」装扮工坊
> - `utils/dateContinue.ts` —— 见面回访（接着见他/本场阅读/语音下载）
>
> **通话 / 语音**
> - `components/call/IncomingCallOverlay*` + `utils/incomingCall*` + `components/call/VoicePhoneB.*` —— 角色来电全屏浮层 + 语音小手机 B
> - `utils/unfinishedCall`、`callReroll`、`callSpeech*`（Guard/Lines/Timeline/Timing）、`callTtsProxy` —— 未挂断续播、挂断补记、通话字幕跟读歌词化
> - `hooks/useVoiceInput.ts` + `utils/volcStt.ts` —— 火山 STT 语音输入
> - `utils/fishTimestampTts`、`fishDrama3`、`ttsCallLog`、`voiceContentBackfill`、`voiceMessagePrompt`、`chatVoiceTagFormat` —— 鱼声时间轴/Drama3/账单/语音话术/语音标签格式
>
> **日程 / 系统 / 桌面**
> - `components/schedule/Fate*`（20 件） + `utils/fate*` —— 「命运牌阵」：塔罗/毛线球 UI、六神、内置因子，叠加在原作者日程上（牌库/情绪/小剧场）
> - `utils/worldbookDocument*.ts`、`docxText.ts` —— 世界书 Word/TXT/PDF/RTF/网页整篇导入
> - `utils/memoryDayActivation.ts` —— 神经链接按日激活 + 按日 RECALL
> - `utils/characterBundle.ts` + `settings/CharacterMoveCard.tsx` —— 角色搬家
> - `utils/forkBackup*` —— 二改全量备份（**旁挂一层，作者原备份逻辑不动**）
> - `components/lockscreen/`（11 件） + `utils/lockScreenSettings|lockScreenMotion|lockScreenEditor` —— **v5 锁屏整包**：亮屏动画、拖动/回弹/进桌面、四分区玻璃（大钟/电池圆环/聊天/相机）、实况天气、真实未读与音乐、大钟描边遮罩、私聊卡跟手渐显、长按气泡上滑解锁、桌面图标入场时间轴、独立上下阴影编辑 + 编辑器
> - `components/os/SplashScreen*`、`AppWindowHost`、`AppRouteScope`、`appPortal`、`Modal.css` + `utils/appWindowMotion*`、`splashScreen` —— **黑球猫猫开屏**（Splash + 首帧预绘 + 桌面交接）、默认应用/PWA/传统图标一整套（`public/icons/black-cat-*`）、轻量窗口舒展与横向切换动效
> - 桌面整理（在作者 Launcher / AppIconEditor 内做，文件是 M 但属二改大件）：长按拖动真正交换、同一次往返跨页交换、透明自定义图标保留阴影
> - `components/BatteryReminder*` + `utils/batteryReminder*` + `settings/BatteryReminderSettingsCard.tsx` —— 电量提醒
> - `tools/prompt-browser/` —— 本地提示词看板小工具（拉黑施工时引出）
> - 小件：`utils/appToast`、`autoGrowTextarea`、`dockMicHold`、`random`、`proxyFallback`、`blobRefSessionCache`、`chatMessageOrder`、`chatSurface`、`chatPreviewViewport`、`launcherLayout`、`appLoadingFallback`、`tokenImgPlaceholder` 等
>
> **拉黑 / Spark（早期二改）**
> - `utils/block.ts`、`blockCallHangupReply.ts`、`components/chat/blockCards.css`、`public/block-cards-preview.html` —— 「拉黑冷战」（细则见 docs/block-coldwar.md）
> - `utils/sparkCircles`、`sparkCommentParse`、`sparkAvatar` + `apps/social/SparkPostImage.tsx`（实验说明见 docs/spark-experiment-follow.md）
>
> **二改自己写的 docs/（4 份）**：`block-coldwar.md`、`emoji-permission.md`、`miaomiao-box-初版方案.md`、`spark-experiment-follow.md`。
> **二改也改过这 4 份作者 docs**（并上游时注意冲突）：`memory-system-overview.md`、`elevenlabs-tts.md`、`date-entry.md`、`superpowers/specs/2026-08-09-pwa-custom-icon-design.md`。
>
> ## 二 · 二改的规矩
> - **唯一的日志在项目根 `WORKLOG.md`**：新条目记文件最顶上，格式 `# YYYY-MM-DD · 标题`（做了什么/动了哪些文件/怎么验证/没做什么）；不进 git，换电脑手动拷。
> - **人设与猫的纪律在项目根 `SULLY.md`**（在 .gitignore 里，不进 git）：说话、脾气、干活纪律全听它。
> - **备份分两类**：git 管得着的（代码、已跟踪文档）**不手工复制**——改前 `git status` / `git diff` 看清，回退用 `git restore`，重要节点经用户点头 commit 当存档；git 管不着的（项目根 `WORKLOG.md`、`SULLY.md` 这类 .gitignore 里的、仓库外材料与施工单）**改前必须复制到备份目录并校验**。
> - **git**：`my-custom` 分支干活；没点头不 commit、没明说「推送」不 push（push 触发线上部署）；`vite.config.ts` 的本地预览挂载不进提交；**不改作者原备份导入/导出。**
> - **并上游**：开 `merge/upstream-YYYYMMDD` 分支 + `backup/*-before-upstream-*` 备份分支，手合、跑测试、验收后才替代主线，绝不强推；不认可的作者提交单独 revert。
> - **新代码放哪**：小工具进 `utils/`（同名 `.test.ts` 跟着）；新组件进 `components/<族>/`；新 App 进 `apps/<名>/`；少动作者文件，动前先看 `git log upstream/master -- <file>`。
> - **老内核**：用户的手机浏览器 = 老内核，禁用 ES2020 之后的新语法。
> - **Key**：永远由用户自己填，AI 不经手。
> - **临时产物**：截图、探针、临时脚本收尾删干净；独立设计预览放仓库外专用目录，不放 `test/fixtures/`。
> - **版本号**：只有大功能更新才动 `utils/appVersion.ts`；小修不跳。
>
> ## 三 · 指路（都在这三份里，不用到处翻）
> - **进度** → 项目根 `WORKLOG.md` 顶部（唯一正本，从 2026-09-13 记到今天；历史两条线已合并、对账完毕）
> - **人设 + 全部纪律** → 项目根 `SULLY.md`
> - **原作者文档地图** → 本文件下半部（跟二改无关，拉上游时原样保留）

# AGENTS.md

给 AI 编程助手（Claude Code 等）的项目导航。SullyOS 是装在浏览器里的虚拟手机系统（React + TS + Vite，local-first，IndexedDB 存储）。详细介绍见 [`README.md`](./README.md)。

这份文件只做一件事：**告诉你遇到某类问题该去翻哪份文档**，别在代码里瞎逛。

> 包管理器统一用 **pnpm**：装依赖 `pnpm install`、跑测试 `pnpm vitest run`、跑脚本 `pnpm <script>`。别用 npm / yarn（仓库里是 `pnpm-lock.yaml`）。

## 文档地图

静态资源、Service Worker 缓存、离线启动或网页更新：先读 [`docs/static-resource-cache.md`](./docs/static-resource-cache.md)。不得注销推送 SW、清应用数据库或按整个 `/assets/` 目录设置 immutable。

| 主题 | 文档 | 什么时候看 |
|------|------|-----------|
| **用户空间 / 角色继承 / 共享素材** | [`docs/user-spaces.md`](./docs/user-spaces.md) | 改用户切换、角色专属用户资料、跨空间继承、备份范围或素材删除前必读；会话固定所属空间、配置独立文件共用、继承不带经历、定位隐私不备份 |
| **悬浮球与全局返回** | [`docs/navigation.md`](./docs/navigation.md) | 改快捷导航开关、拖动安全区、浏览器／Android 返回、美化子页退出前必读 |
| **iOS 27 主屏幕顶部白雾 / 状态栏底色** | [`docs/ios-status-bar-edge.md`](./docs/ios-status-bar-edge.md) | 改顶部取色、viewport 或 iOS 门禁前必读；manifest standalone 使用 contain，零安全区不回退 44px，异步高度收缩要重建基线；纯色接合不等于壁纸贯穿 |
| **3D 小屋 · 布局与功能分区** | [`docs/room3d-layout.md`](./docs/room3d-layout.md) | 设计或重排任何房间/样板房、自动摆家具前必读；先划功能区，再按家具组合摆放，保留连续动线，不能逐件随机找空位；本轮统一黑 × 绿 × 白 |
| **美化分享码与人工审核** | [`docs/beauty-share.md`](./docs/beauty-share.md) | 改美化投稿、作者身份、分享码领取或 `worker/beauty-share` 前必读；未审文件保持私有，更新通过后才替换已发布指针，仅作者明确授权且已审作品进入公开静态装扮库，未授权旧作不公开 |
| **角色默认对话 API** | [`docs/character-api.md`](./docs/character-api.md) | 改角色独立 API、API 预设分组或对话模型路由前必读；App 优先，单角色回复才使用角色默认，凭据整套选择 |
| **Anthropic 原生接口 / Prompt Caching** | [`docs/anthropic-messages.md`](./docs/anthropic-messages.md) | 改 Messages 转换、SSE、缓存或 amsg 原生模型调用前必读；原生端点随整套凭据保存，不新增代理，旧 Worker 先更新并验证能力 |
| **ElevenLabs 角色语音** | [`docs/elevenlabs-tts.md`](./docs/elevenlabs-tts.md) | 改 v4 / Turbo 语音、Audio Tags、模型参数或字幕前必读；v4 保留开放式标签，只发送稳定度与相似度，不自动降级 |
| **角色统计 / 上下文字数与 Token 估算** | [`docs/character-statistics.md`](./docs/character-statistics.md) | 改神经链接角色统计前必读；可读范围不等于实际请求，概率预览不得抽签，宫殿缓存单列 |
| **世界书管线、分组与角色绑定** | [`docs/worldbook-management.md`](./docs/worldbook-management.md) | 新增 App／角色生成请求或改世界书前必读；新入口使用 ContextBuilder.buildCharacterRequest，世界书自动随角色装载；绑定按 ID，库与角色缓存同事务更新 |
| **协同工作私聊衔接与转发** | [`docs/collaboration-chat-bridge.md`](./docs/collaboration-chat-bridge.md) | 改协同读取 ChatApp 范围或转发消息前必读；每轮读 DB，空范围不回退，多选只发当前窗口 |
| **开发调试面板 / 开关** | [`docs/dev-debug.md`](./docs/dev-debug.md) | 加 dev-only 开关、加调试日志、排查"角色怎么又不说话了"。含逐步指南 |
| **彼方 · 书库分类与阅读偏好** | [`docs/kanata-library.md`](./docs/kanata-library.md) | 改书籍归类、批量整理、角色选书轮换或书库备份前必读；按分类模式不得回退全书库 |
| **彼方 · 活动选择与自动范围** | [`docs/kanata-activities.md`](./docs/kanata-activities.md) | 改房间/SAR 随机选取、手动子玩法路由或高级排除设置前必读；自动全禁用不得回退，手动可绕过 |
| **记忆系统** | [`docs/memory-system-overview.md`](./docs/memory-system-overview.md) | 涉及长期记忆、月度总结、向量化记忆宫殿、情感空间。改记忆相关逻辑前必读 |
| **查手机 · 人际关系系统** | [`docs/relationship-system.md`](./docs/relationship-system.md) | 改「查手机」聊天/通讯录、角色联系人/好感、真假甄别、真角色双向对话、虚构 NPC 约束前必读 |
| **好友圈 · 独立 App 与家园手机** | [`docs/friend-feed.md`](./docs/friend-feed.md)、[`docs/friend-feed-weibo.md`](./docs/friend-feed-weibo.md) | 改好友圈入口、生活圈、动态评论、微博或备份前必读；双入口共用数据，角色按 ID 分圈；绑定微博按 RP 身份混排，同步不写记忆；通知提供文本操作格式，微博复用设置代理 |
| **查手机 · 人格模拟与生活记录** | [`docs/persona-sim.md`](./docs/persona-sim.md) | 改「用 TA 的手机活一次」生成、保存、断点续播或完成效果前必读；生成即归档，通知不是唯一剧本，首次到结尾才加情绪效果 |
| **见面 · 观测协议 OBSERVE** | [`docs/date-observe.md`](./docs/date-observe.md) | 改见面（DateApp）的角色观测面板：提示词注入、掉格式解析容错（两层）、全息 HUD 渲染前必读 |
| **银行 / 生活记录 · 收支记账** | [`docs/bank-ledger.md`](./docs/bank-ledger.md) | 改收入、支出、角色代记、预算或 CSV 导出前必读；旧流水默认支出，收入不扣支出预算，全部导出跨月跨年 |
| **彼方 · 信号坠落处（跨用户接龙诗）** | [`docs/signal-poetry.md`](./docs/signal-poetry.md) | 改彼方(VRWorld)「信号坠落处」房间：跨实例合写现代诗、复用漂流瓶后端、`po_poems`/`po_poem_lines` 表与 `/poem/*` 端点、两层容错解析、并发安全前必读 |
| **捏人器 PSD 导入 / 部件投影层** | [`docs/char-creator-psd-import.md`](./docs/char-creator-psd-import.md) | 改捏人器素材管线、部件阴影（正片叠底预转）、PSD 图层组约定前必读 |
| **QQ捏人工坊（神经链接手办柜）** | [`docs/chibi-studio.md`](./docs/chibi-studio.md) | 改小小窝/彼方/520 三处 Q 版形象、捏人器 savedState 还原、`chibiStudio` 字段前必读 |
| **3D 小人 · 服装与衣橱** | [`docs/chibi-clothing-assets.md`](./docs/chibi-clothing-assets.md) | 改 3D 服装建模、肩袖/领口、蒙皮遮挡、版型参数、分类与缩略图前必读；使用当前 48 骨素体，复用认可母版，先查参考再局部制作，保留用户确定的窄肩/A 字袖规则 |
| **3D 小屋 · 家具素材与交互** | [`docs/room3d-furniture-assets.md`](./docs/room3d-furniture-assets.md)、[`docs/room3d-seating-assets.md`](./docs/room3d-seating-assets.md)、[`docs/room3d.md`](./docs/room3d.md) | 导入 GLB / 其他家具、改配色/优化/坐位/浇水前必读；清理图片贴图，自行上色，统一项目木色，拆分桌上摆件并验收 chibi 空间 |
| **角色自定义时区** | [`docs/character-timezone.md`](./docs/character-timezone.md) | **写任何跟时间有关的代码前先扫一眼**：prompt 里的「现在是」、角色作息/夜间判断、日期 key、界面上的钟。分清「角色那边几点」和「用户自己的时间」，别自己手搓时差。文末列了还没接时区的几处（主动消息 + 几块界面上的钟），**正式发版前记得过一遍** |
| **通用 MCP 工具服务器** | [`docs/mcp-client.md`](./docs/mcp-client.md)（开发者）、[`docs/mcp-user-guide.md`](./docs/mcp-user-guide.md)（用户教程，设置「?」弹窗跳转的就是它，改接入行为要同步） | 改用户自配 MCP 接入（设置板块、握手/session、工具循环、`?target=` 代理约定、worker/mcp-proxy）或排查「工具连不上/角色不调工具」前必读；主动消息 2.0 的后台 MCP 路径（配置上云 / fire 时注入 / worker 直连执行）也在这份 |
| **云端数据管理 / 角色删除** | [`plans/amsg2-cloud-data-management-contract.md`](./plans/amsg2-cloud-data-management-contract.md) | 改云端清单、按项清理、删除角色、停用与恢复前必读；清单以服务端实际资源为准，删除由云端持久操作执行，旧请求不可随恢复获得新代次 |
| **主动消息 2.0 · 即时对话** | [`plans/amsg2-instant-chat.md`](./plans/amsg2-instant-chat.md)（设计与取舍）、[`plans/amsg2-instant-chat-contract.md`](./plans/amsg2-instant-chat-contract.md)(端点/信封/fire_pack v7 契约) | 改「聊天在用户自己的 CF Worker 上生成」这条路（`POST /instant-chat`、`utils/amsgInstantChat.ts`、fire_pack 的 `chat` 段、chat_outbox 补收、「正在输入」超时）前必读 |
| **主动消息 2.0 · 后台任务（不说话的活儿）** | [`plans/amsg2-expansion.md`](./plans/amsg2-expansion.md) | 改「页面关着也能跑完」的后台活儿前必读：`metadata.amsgKind` → handler 注册表（`worker/amsg/src/fireKinds.ts`）、一次性输入的 `amsg:job` 命名空间与 TTL、`ctx.emitResult` 的结果回程与客户端分发（`utils/amsgResults.ts`）。文首「现状」是实况，正文是「还有哪些调用点值得搬、哪些不该搬」的取舍 |
| **离开后消息** | [`docs/away-message.md`](./docs/away-message.md) | 改「用户多久没说话角色就来找」前必读；开着 2.0 的角色走云端推送、其余本地上线时补，不叠加；云端到点必发且计入连发上限，一次离开只找一次 |
| **主动消息 · 频率与额度** | [`docs/amsg2-pacing-limits.md`](./docs/amsg2-pacing-limits.md) | 改角色能自己排什么、连发/间隔/每日上限、重复消息没回就停、任务名额，或者改给角色看的「用户给你定的规矩」前必读；上限是代码硬闸，默认值只在 `utils/amsgLimits.ts` 定义一次 |
| **主动消息 2.0 · API 凭据引用 credRefs** | [`plans/amsg2-llm-credentials-contract.md`](./plans/amsg2-llm-credentials-contract.md) | 改凭据上云（`llm_credentials` 表、任务 `credRefs`、`utils/amsgLlmCredentials.ts` 的每角色三行）或排查「换 Key 后主动消息 401 / 不来了」前必读；文末「SullyOS 侧落地」是实况 |
| **使用统计** | [`docs/analytics.md`](./docs/analytics.md) | **加任何埋点前必读**。收什么/不收什么的边界、事件名与属性的规矩（属性只能是固定枚举）、构建时门禁与开关、完整事件清单。想加「某功能有多少人开了」看「加新埋点的规矩」第 5 条，别在配置页现场发 |
| **二改 / 加 App / 数据流 / 后端 Worker** | [`README.md`](./README.md) 「给想二改的人」一节 | 新增 App、build badge、sfworker 代理替换、开源协议 |

> README 的「给想二改的人」区域信息量很大（数据流、ContextBuilder、sfworker 清单），动后端 / 加功能前先扫一遍。

用户定位、隐私区域、地点查询与位置提示词：先读 [`docs/user-location.md`](./docs/user-location.md)。中心坐标仅本机；命中隐私圈不得查地图；不得通过 Worker／代理转发定位，也不得把原始坐标写入提示词、日志、备份或云端状态。

## 什么时候改版本号

[`utils/appVersion.ts`](./utils/appVersion.ts) 里的 `APP_VERSION`（形如 `v3.0 (Ambient Presence)`）是手工维护的，**只有大功能更新才动它**：加了新 App、新系统，或者一整套用户能直接感知到的新玩法。

性能优化、bug 修复、文案调整、重构这些都不算，做完就是做完了，既不用改版本号，也不用在收尾时问一句「要不要顺便升个版本」。拿不准就照这条判断：用户在设置页看到版本号变了，能不能说出多了什么新东西——说不出来就是不该改。

它有三个用处：设置页底部显示的就是它；统计还拿版本号那半截当标签，面板按它切分数据；网页更新也看版本号那半截，变了才给正在用的人弹「新版本已准备好」，没变的更新等下次打开或刷新时悄悄换上。版本号跟着大功能走，标签才对得上「哪一版铺开到什么程度、这版的人在用什么」；小修小补也跳版本的话，标签会碎成一堆没法比的小格子。括号里的代号只在界面上显示，不进标签。构建 hash（`BUILD_LABEL`）是自动生成的，不用管。
