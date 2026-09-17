# WORKLOG — feat/block-coldwar 线

> 本文件是拉黑分支（feat/block-coldwar）线的工作日记。spark 线的 WORKLOG 在 spark 分支自己的存档里，同名但互不相干。

---

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
