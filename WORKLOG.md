# WORKLOG — feat/block-coldwar 线

> 本文件是拉黑分支（feat/block-coldwar）线的工作日记。spark 线的 WORKLOG 在 spark 分支自己的存档里，同名但互不相干。

---

## 2026-09-18 晚（家中大电脑）

- **存档 d3841318**：昨晚遗留工作区改动落账——全屏根修（返回守卫 replaceState 清标记）、去遮罩改点击任意处恢复全屏、白框弹窗开着时拦截系统返回。commit 后已验 `rev-parse HEAD == feat/block-coldwar`（本次 refs 未被吃）。**只 commit 未 push**。
- **排查「清空白框 50% 黑屏一下」**：链路走查完毕（详见 `D:\SullyOS\排查报告-清空白框黑屏-0918晚.md`）。实锤：清空=该角色 chromeCustomCss 置空 → L3767/L3801 两枚 style 标签整体卸载 + 整屏样式重算；updateCharacter/normalizeCharacterImpression/弹层全部轻量无副作用，无重载、无全屏 API、无 history 操作。嫌疑：拆标签+整屏重绘（毛玻璃弹窗加重）在手机 GPU 上露一两帧黑，纯渲染层现象；App 侧无逻辑 bug。缓解选项 A（不拆标签只掏空）/B（120ms 淡入）/C（认浏览器抖动）已列，等 Ann 拍板，一行未改。
- **黑屏真凶改判（Ann 关键证据「原版从没黑过」+ 另一 AI 推理，猫儿认可）**：元凶是本线新加的 PhoneShell 捕获阶段 click 恢复全屏监听——非全屏时点「清空」这类按钮也顺带 requestFullscreen，安卓进全屏瞬间露一帧 index.html 深色底(#0f1115)＝黑一下；已在本全屏则 return，故体感约半数闪。原版无此监听，所以从没出现过。前一行的「重绘/毛玻璃」嫌疑降级为次要。
- **施工单改口已施工（未 commit）**：PhoneShell.tsx 全屏恢复监听收窄——event.target.closest('button, a, input, textarea, select, label, [role="button"], [role="dialog"]') 命中即 return（交互零件不抢全屏），空白处照常恢复全屏；不做透明罩/顶岛，不改清空逻辑。tsc 全量 54（=基线），PhoneShell/Chat 零新错。5173 预览存活，HMR 已推送。验收口径：非全屏点「清空」不闪黑；点桌面空白仍回全屏。
- **收窄方案已过验收**（Ann 21:19「可以了」）。
- **新功能：外观 App「全屏模式」总开关（逃生门，Ann 点名要的；未 commit）**：
  - types.ts：主题类型新增 `fullscreenEnabled?: boolean`（undefined 视为开启，与各动画开关同口径）。
  - Appearance.tsx「系统主题」页新增「全屏显示」区一块开关：关=立即退出全屏并存档（逃生门本体）；开=趁当次点击手势尽力进全屏，失败不拦。带 toast 与埋点。
  - PhoneShell.tsx：开关为 false 时干脆不挂捕获 click 恢复监听（effect 按 [fullscreenEnabled] 重挂）；BootSequence 传 `allowFullscreen={fullscreenEnabled}`。
  - BootSequence.tsx：新增 `allowFullscreen?: boolean`（默认 true），skip() 的全屏请求加开关闸；boot 守卫放行、退场逻辑一律不动。
  - 全项目全屏请求点共四处：Boot/PhoneShell（本次全部上闸）+ DinosaurGarden/FishingGame（桌面小游戏自有 F 键逻辑，不属手机壳全屏，未动）。
  - tsc 全量 54（=基线）零新错；5173 预览存活 HMR 已推。当前工作区累计两笔未存档改动：黑屏收窄修复 + 本开关。
- **产出分享版技术文档（未 commit，文档在工作区根不在仓库）**：`D:\SullyOS\全屏方案-技术架构与避坑-二改分享版-20260918.md`——给其他二改作者的"扔给 AI 即用"图纸。四部件+一底座（Boot 手势进全屏 / index.html 全屏态安全区清零 / PhoneShell 捕获 click 收窄恢复 / Appearance 逃生门开关 / browserBackGuard replaceState 根修）+ 8 坑速查表 + 8 条手机验收清单 + 字段速查 + 诚实边界（iOS 拒绝、小游戏 F 键不属本方案、chunk 自动重载需区分来源）。全部代码引文逐段核对现工作区实文（含 registerBackHandler 单槽语义 OSContext L5379）；文档内不含 Ann 之外的身份信息。

## 2026-09-18 凌晨（家中大电脑，D:\SullyOS\SullyOS-master\SullyOS-master）

### 已完成并推远端（origin/shijieheping113，已 ls-remote 验收）

**① 语音识别字落正文 `531c19e`**
- 新发语音：STT 文字直接作为消息 content 纯文本存（不再包 `<语音>` 壳），原声照旧存 IndexedDB；`metadata.stt` 作为语音条记号。
- 旧消息：进聊天静默扫描，正文无字但 `voice_msg_*` 资产里有 originalText/transcript → 写回同一条 content；已有字的不动；壳里夹字的顺手拆壳。
- UI：语音条改认 stt 记号（`MessageItem.tsx` hasUserSttMarker），无原声也出语音条 + 转文字；顶部不会多文字泡；AI TTS 路径零改动。
- 新文件：`utils/voiceContentBackfill.ts` + `.test.ts`（7/7 过）。tsc 54 错 = 基线（改动文件零新错）；vitest 5162/5164（2 失败为基线既有 callApp 项）；build --minify false 36s 过。

**② Chrome 安卓全屏系列 `c5403720`**
- `BootSequence.tsx`：skip 同步栈里 requestFullscreen(documentElement)；删自动退场（必须点一下才有手势，否则刷新后全屏请求抢跑失败）；加开屏返回守卫（pushState 软垫，防开屏挂起时按返回被浏览器译成"关网页"——Ann 实测踩中过）；「轻触进入」提示两版本都显示。
- `PhoneShell.tsx`：全屏门哨兵组件（fullscreenchange 监听，退出全屏盖遮罩点按恢复，右下"跳过"防锁死），锁屏/桌面两个 return 都挂了。
- `index.html`：`html:fullscreen / -webkit-full-screen` 下 `--safe-top: 0px; --chrome-top: 0px`（放在 compact 规则之后保证覆盖；`--safe-bottom` 保留）。

### 待办（明天第一件事）

1. **删全屏门遮罩**——Ann 明确说过"啥都不用遮罩了，太难看，影响日常使用"，当时被两个 bug 插队没执行。删 `PhoneShell.tsx` 里 FullscreenGate 组件 + 两处挂载点即可。**当前推送版本里遮罩还在。**
2. 手机端全屏实测：开屏点击进全屏（刷新后也必须能成）、全屏时顶部空块消失、开屏期间按返回不再关网页。
3. `c5403720` 未跑过手机实测确认（tsc 已过）。

### 环境 / 坑（接手的猫儿必读）

- **refs 被吃在这台机器实锤两连**：git commit 报成功但 ref 不落（对象完好）。修法 = node 直写 loose ref **并且同步改 packed-refs 对应行**（双保险，昨晚只写 loose ref 后来也被延迟吃掉了）。每次 commit 后必须 `git rev-parse` 验收。
- `git config credential.helper manager` 已配到本仓库（09-18 凌晨，首次 push 弹过 CredentialHelper 选择框，配后不再弹）。
- vite build 压缩阶段会被环境卡死：验收用 `node node_modules/vite/bin/vite.js build --minify false`（36s）。
- 家里预览：`dev-https2.tmp.mjs`（独立 cacheDir=.vite-dev2），地址 `https://192.168.0.103:5173`，三要素错一个=空库假象。卡 Re-optimizing 超 30 秒 = 假死，杀进程换缓存目录重启。
- 避坑宝典：`D:\SullyOS\避坑宝典-部署与打包卡死-20260918.md`（速查表+标准流程）。
- 杂物：仓库根 tmp-voice*.cjs / tmp-audit*.cjs / vitest-results.json 等 untracked 调试脚本，待 Ann 点头清理。
