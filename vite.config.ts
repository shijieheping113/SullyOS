import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { readFileSync, existsSync } from 'node:fs';
import https from 'node:https';
import crypto from 'node:crypto';
import { bakeVoiceMiddleware } from './server/bake-voice-middleware';

// 构建时抓 git 分支 + short commit + UTC+8 构建时间，注入到版本信息显示。
// 非 git 环境（容器、tarball 部署）退化成 'unknown'，不影响构建。
//
// 显示规则：
//   - 默认在 main / master 上隐藏（视为正式发布），其他分支显示
//   - CI detached HEAD 优先读 GITHUB_REF_NAME / VERCEL_GIT_COMMIT_REF / CF_PAGES_BRANCH / BRANCH(Netlify)
//   - VITE_HIDE_BUILD_BADGE=1 强制隐藏（覆盖默认）
//   - VITE_SHOW_BUILD_BADGE=1 强制显示（在 master 本地调试用）
const RELEASE_BRANCHES = new Set(['main', 'master']);
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;

function formatBuildTimeUtc8(date = new Date()): string {
  const utc8Date = new Date(date.getTime() + UTC8_OFFSET_MS);
  return `${utc8Date.toISOString().slice(0, 19).replace('T', ' ')} UTC+8`;
}

function readBranch(): string {
  if (process.env.GITHUB_REF_NAME) return process.env.GITHUB_REF_NAME;
  if (process.env.VERCEL_GIT_COMMIT_REF) return process.env.VERCEL_GIT_COMMIT_REF;
  if (process.env.CF_PAGES_BRANCH) return process.env.CF_PAGES_BRANCH;
  if (process.env.BRANCH) return process.env.BRANCH;
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}
function readCommit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  if (process.env.CF_PAGES_COMMIT_SHA) return process.env.CF_PAGES_COMMIT_SHA.slice(0, 7);
  if (process.env.COMMIT_REF) return process.env.COMMIT_REF.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}

const gitInfo = { branch: readBranch(), commit: readCommit() };
const buildTime = formatBuildTimeUtc8();
const isReleaseBranch = RELEASE_BRANCHES.has(gitInfo.branch);
let showBuildBadge = false; // Ann 2026-09-16：永久关闭右下角测试版本号（想看时挂 VITE_SHOW_BUILD_BADGE=1）
if (process.env.VITE_HIDE_BUILD_BADGE === '1') showBuildBadge = false;
if (process.env.VITE_SHOW_BUILD_BADGE === '1') showBuildBadge = true;

// 开发环境出站代理（可选）：某些网络（如公司内网）直连不了外网 TTS/语音 API，
// 设 DEV_OUTBOUND_PROXY=http://127.0.0.1:7890 后，下面的 dev proxy 转发改走该代理。
// 不设置时行为与原来完全一致（直连）。
const outboundProxyUrl = process.env.DEV_OUTBOUND_PROXY || '';
const outboundAgent = outboundProxyUrl ? new HttpsProxyAgent(outboundProxyUrl) : undefined;
const withOutboundProxy = <T extends object>(cfg: T): T & { agent?: HttpsProxyAgent<string> } =>
  outboundAgent ? { ...cfg, agent: outboundAgent } : cfg;

export default defineConfig({
  resolve: {
    // Live2D subclasses Pixi containers, so both the renderer and the engine
    // must share the same Pixi prototype/extension registry in dev and builds.
    dedupe: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'pixi.js',
      '@pixi/sound',
    ],
  },
  plugins: [
    react(),
    {
      name: 'bake-voice-middleware',
      configureServer(server) {
        server.middlewares.use('/api/minimax/bake-voice', bakeVoiceMiddleware);
      },
    },
    {
      // 豆包 Key 体检：替浏览器向火山做一次真实的 WS 升级握手，
      // 把火山的原话（401 Invalid X-Api-Key / 403 未开通服务等）带回给测试页。
      // 浏览器的 WebSocket onerror 不带任何细节，这个接口用来把失败原因拿到明面上。
      name: 'volc-ws-check',
      configureServer(server) {
        server.middlewares.use('/api/volc-check', (req, res) => {
          const u = new URL(req.url || '/', 'http://localhost');
          const key = u.searchParams.get('key') || '';
          const reqId = u.searchParams.get('request_id') || crypto.randomUUID();
          const finish = (data: { ok: boolean; status?: number; body?: string }) => {
            console.log(`[volc-check] 探测结果: ok=${data.ok} status=${data.status ?? '-'}`);
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(data));
          };
          const probe = https.request(
            {
              host: 'openspeech.bytedance.com',
              path: '/api/v3/sauc/bigmodel_async',
              method: 'GET',
              headers: {
                Connection: 'Upgrade',
                Upgrade: 'websocket',
                'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'),
                'Sec-WebSocket-Version': '13',
                'X-Api-Key': key,
                'X-Api-Resource-Id': 'volc.seedasr.sauc.duration',
                'X-Api-Request-Id': reqId,
                'X-Api-Sequence': '-1',
              },
              timeout: 8000,
            },
            (up) => {
              // 非 101：握手被拒，读出火山的拒绝理由
              let body = '';
              up.on('data', (c) => (body += c));
              up.on('end', () => finish({ ok: false, status: up.statusCode, body: body.slice(0, 300) }));
            },
          );
          probe.on('upgrade', () => {
            probe.destroy(); // Key 有效，火山放行握手 → 立刻断开（0 秒音频不计费）
            finish({ ok: true });
          });
          probe.on('timeout', () => {
            probe.destroy();
            finish({ ok: false, status: 0, body: '探测超时（8秒，网络不通或被墙）' });
          });
          probe.on('error', (e) => finish({ ok: false, status: 0, body: '网络错误: ' + e.message }));
          probe.end();
        });
      },
    },
  ],
  define: {
    __BUILD_BRANCH__: JSON.stringify(gitInfo.branch),
    __BUILD_COMMIT__: JSON.stringify(gitInfo.commit),
    __BUILD_TIME__: JSON.stringify(buildTime),
    __BUILD_BADGE_VISIBLE__: JSON.stringify(showBuildBadge),
  },
  // GitHub Pages 发布时使用相对路径，避免仓库子路径导致资源 404
  base: process.env.GITHUB_PAGES ? './' : '/',
  esbuild: {
    // 只剥 debugger，保留 console.* —— 部署后按 F12 仍能看到运行时日志，方便排查。
    drop: ['debugger'],
  },
  server: {
    // 本地开发 HTTPS（自签证书在 .dev-certs/，给手机访问用——浏览器要求 HTTPS 才放开麦克风/语音识别）
    ...(existsSync('.dev-certs/key.pem') && existsSync('.dev-certs/cert.pem')
      ? { https: { key: readFileSync('.dev-certs/key.pem'), cert: readFileSync('.dev-certs/cert.pem') } }
      : {}),
    proxy: {
      // 二改：硅基流动语音识别（免费 SenseVoice）本地转发，绕开浏览器跨域
      '/api/sf-stt': {
        target: 'https://api.siliconflow.cn',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/api\/sf-stt/, '/v1/audio'),
      },
      // 二改：硅基流动聊天接口（Qwen3-Omni 多模态语音测试）
      '/v1/chat/completions': {
        target: 'https://api.siliconflow.cn',
        changeOrigin: true,
        secure: true,
      },
      // 二改：豆包（火山引擎）双向流式语音识别 2.0 的 WebSocket 本地转发
      '/api/volc-ws': {
        target: 'https://openspeech.bytedance.com',
        ws: true,
        changeOrigin: true,
        secure: true,
        configure(proxy: any) {
          proxy.on('proxyReqWs', (proxyReq: any, req: any) => {
            const u = new URL(req.url, 'http://localhost');
            const key = u.searchParams.get('key') || '';
            const reqId = u.searchParams.get('request_id') || '';
            if (key) proxyReq.setHeader('X-Api-Key', key);
            proxyReq.setHeader('X-Api-Resource-Id', 'volc.seedasr.sauc.duration');
            if (reqId) proxyReq.setHeader('X-Api-Request-Id', reqId);
            proxyReq.setHeader('X-Api-Sequence', '-1');
            proxyReq.path = '/api/v3/sauc/bigmodel_async';
          });
        },
      },
      '/api/minimax/t2a': withOutboundProxy({
        target: 'https://api.minimaxi.com',
        changeOrigin: true,
        secure: true,
        rewrite: () => '/v1/t2a_v2',
        // Route to 国服 / 海外 based on X-MiniMax-Region header sent by the client.
        router: (req) => {
          const region = String(req.headers['x-minimax-region'] || '').toLowerCase();
          return region === 'overseas' ? 'https://api.minimax.io' : 'https://api.minimaxi.com';
        },
      }),
      '/api/minimax/get-voice': withOutboundProxy({
        target: 'https://api.minimaxi.com',
        changeOrigin: true,
        secure: true,
        rewrite: () => '/v1/get_voice',
        router: (req) => {
          const region = String(req.headers['x-minimax-region'] || '').toLowerCase();
          return region === 'overseas' ? 'https://api.minimax.io' : 'https://api.minimaxi.com';
        },
      }),
      '/api/minimax/music': withOutboundProxy({
        target: 'https://api.minimaxi.com',
        changeOrigin: true,
        secure: true,
        rewrite: () => '/v1/music_generation',
        router: (req) => {
          const region = String(req.headers['x-minimax-region'] || '').toLowerCase();
          return region === 'overseas' ? 'https://api.minimax.io' : 'https://api.minimaxi.com';
        },
      }),
      // 鱼声 Fish Audio TTS：转发到 https://api.fish.audio/v1/tts（返回二进制音频）
      '/api/fishaudio/tts': withOutboundProxy({
        target: 'https://api.fish.audio',
        changeOrigin: true,
        secure: true,
        rewrite: () => '/v1/tts',
      }),
      // ElevenLabs TTS：开发环境把同源查询参数改写到官方 voice_id 路径。
      '/api/elevenlabs/tts': withOutboundProxy({
        target: 'https://api.elevenlabs.io',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => {
          const parsed = new URL(path, 'http://localhost');
          const voiceId = parsed.searchParams.get('voice_id') || '';
          const outputFormat = parsed.searchParams.get('output_format') || 'mp3_44100_128';
          return `/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=${encodeURIComponent(outputFormat)}`;
        },
      }),
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      // 关键修复：将这些包排除在打包之外，让浏览器通过 index.html 的 importmap 加载
      external: ['katex'],
      onwarn(warning, defaultHandler) {
        // 抑制动态导入与静态导入混合的无害警告
        if (warning.message?.includes('dynamic import will not move module into another chunk')) return;
        defaultHandler(warning);
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Local camera emotion calibration is opt-in. Keep MediaPipe out of
            // the preloaded common vendor so its JS is fetched only after the
            // user explicitly enables their camera.
            if (id.includes('@mediapipe/tasks-vision')) {
              return 'vendor-mediapipe';
            }
            // VRM/Three 只在懒加载的 CallApp 视频模式使用。单独成包，避免 3D 引擎
            // 被通用 vendor 首屏加载，普通聊天/桌面用户无需支付这部分体积。
            if (id.includes('@pixiv/three-vrm') || /[\\/]node_modules[\\/]three[\\/]/.test(id)) {
              return 'vendor-vrm';
            }
            // The Cubism adapter checks window.Live2DCubismCore at module evaluation
            // time. Keep it out of the Pixi chunk: the call page and Live2D desktop
            // theme import Pixi eagerly, while live2dCore.ts must load Cubism Core
            // before dynamically importing this adapter.
            if (id.includes('untitled-pixi-live2d-engine')) {
              return 'vendor-live2d-engine';
            }
            if (id.includes('@pixi/') || /[\\/]node_modules[\\/]pixi\.js[\\/]/.test(id)) {
              return 'vendor-live2d';
            }
            if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) {
              return 'vendor-react';
            }
            if (id.includes('@phosphor-icons')) {
              return 'vendor-icons';
            }
            if (id.includes('@capacitor')) {
              return 'vendor-capacitor';
            }
            return 'vendor';
          }
          if (id.includes('utils/memoryPalace')) {
            return 'memory-palace';
          }
        }
      }
    }
  }
});
