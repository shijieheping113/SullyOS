import { describe, expect, it } from 'vitest';
import type { APIConfig } from '../types';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  cleanVideoApiDescription,
  isVideoApi50507Error,
  defaultVideoApiConfig,
  normalizeVideoApiConfig,
  resolveVideoApiCredentials,
  videoApiPresetLabel,
  VIDEO_API_PRESETS,
  VIDEO_API_TEST_VIDEO_URL,
  pickVideoDescriptionMaxTokens,
} from './videoApi';
import { buildVideoModelUserText, VIDEO_MODEL_INSTRUCTION } from './videoShareNote';
import { stripBackupImages } from './backupExport';

describe('videoApi config', () => {
  it('defaults to disabled and 30MB', () => {
    const d = defaultVideoApiConfig();
    expect(d.enabled).toBe(false);
    expect(d.maxSizeMB).toBe(30);
    expect(d.maxDurationSec).toBe(200);
  });

  it('matches recommended preset label', () => {
    const cfg = normalizeVideoApiConfig(defaultVideoApiConfig());
    expect(videoApiPresetLabel(cfg)).toBe('推荐（默认）');
  });

  it('shows custom when detail is auto', () => {
    const cfg = normalizeVideoApiConfig({ ...defaultVideoApiConfig(), detail: 'auto' });
    expect(videoApiPresetLabel(cfg)).toBe('自定义');
  });

  it('resolves key fallback vision then stt', () => {
    const api: APIConfig = {
      baseUrl: '',
      apiKey: '',
      model: 'gpt',
      videoApi: { ...defaultVideoApiConfig(), enabled: true, apiKey: '' },
      visionApi: { enabled: false, baseUrl: '', apiKey: 'vision-key', model: '' },
      sttApi: { engine: 'teleasr', sfApiKey: 'stt-key' },
    };
    expect(resolveVideoApiCredentials(api).apiKey).toBe('vision-key');
    api.visionApi!.apiKey = '';
    expect(resolveVideoApiCredentials(api).apiKey).toBe('stt-key');
  });

  it('preset list has six modes including half_minute', () => {
    expect(VIDEO_API_PRESETS).toHaveLength(6);
    expect(VIDEO_API_PRESETS.some(p => p.id === 'half_minute')).toBe(true);
  });

  it('clamps custom maxFrames up to 256', () => {
    const cfg = normalizeVideoApiConfig({ ...defaultVideoApiConfig(), maxFrames: 400 });
    expect(cfg.maxFrames).toBe(256);
  });

  it('ships built-in probe mp4 in public', () => {
    const rel = VIDEO_API_TEST_VIDEO_URL.replace(/^\//, '');
    expect(existsSync(join(process.cwd(), 'public', rel.replace(/^test-assets\//, 'test-assets/')))).toBe(true);
  });
});

describe('pickVideoDescriptionMaxTokens', () => {
  it('scales with effective frame count', () => {
    expect(pickVideoDescriptionMaxTokens(20, 8)).toBe(4000);
    expect(pickVideoDescriptionMaxTokens(25, 50)).toBe(8000);
    expect(pickVideoDescriptionMaxTokens(25, 16)).toBe(4000);
    expect(pickVideoDescriptionMaxTokens(25, 20)).toBe(6000);
    expect(pickVideoDescriptionMaxTokens(60, 120)).toBe(10_000);
  });
});

describe('50507 detection', () => {
  it('detects siliconflow 50507 in error message', () => {
    expect(isVideoApi50507Error(new Error('code 50507'))).toBe(true);
    expect(isVideoApi50507Error(new Error('timeout'))).toBe(false);
  });
});

describe('video model prompt text', () => {
  it('uses Ann定稿 instruction', () => {
    expect(VIDEO_MODEL_INSTRUCTION).toContain('【主线概括】');
    expect(VIDEO_MODEL_INSTRUCTION).toContain('最后一镜');
    expect(VIDEO_MODEL_INSTRUCTION).toContain('画面即为');
    expect(VIDEO_MODEL_INSTRUCTION).toContain('角色扮演型');
    expect(buildVideoModelUserText('我的标题')).toContain('（主题参考，勿逐字复述）我的标题');
    expect(buildVideoModelUserText('我的标题')).toContain('【视频类型】');
  });

  it('strips conversational openers from api description', () => {
    expect(cleanVideoApiDescription('好的，我们来描述：一只猫')).toBe('描述：一只猫');
  });
});

describe('video backup strip', () => {
  it('strips data:video but keeps metadata text', () => {
    const msg = {
      type: 'video',
      content: 'data:video/mp4;base64,AAAA',
      metadata: { videoDescription: '画面里有猫' },
    };
    const stripped = stripBackupImages(msg);
    expect(stripped.content).toBe('');
    expect(stripped.metadata.videoDescription).toBe('画面里有猫');
  });
});
