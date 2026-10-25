/**
 * 电波每一轮落库之后的记忆宫殿整理口子（Ann 2026-10-25 定：每轮一次，下播不补）。
 *
 * 抄的是 3D 家园那一份（utils/homeMemoryPostHook.ts），因为电波和家园是同一种处境：
 * 只往聊天里落库、自己没有触发口。这里只负责「叫一声」，界面反馈交给调用方：
 * - 按角色排队：同一角色同时只跑一趟；
 * - 同一轮只算一次（roundKey 去过就不再叫）；
 * - 读角色最新状态：宫殿开关关着就不叫；
 * - 向量那份或轻量模型没配就不叫；轻量模型没配就回落主聊天 API；
 * - 叫的是现成那套管线（processNewMessagesWithAutoArchive，它自己按水位线判断够不够）；
 * - 之后按共用计数器每 50 轮跑一次认知消化。
 * 宫殿本体（管线、提示词、水位线、检索）一个字不动。
 */
import type { APIConfig } from '../types';
import { DB } from './db';
import { processNewMessagesWithAutoArchive } from './memoryPalace/autoArchive';
import { incrementDigestRound, runCognitiveDigestion } from './memoryPalace/digestion';
import type { EmbeddingConfig } from './memoryPalace/types';
import type { LightLLMConfig, PipelineResult } from './memoryPalace/pipeline';

/** 已经叫过整理的轮次；同一轮不重复叫 */
const seenRounds = new Set<string>();
/** 每个角色一条队：同一角色同时只跑一趟 */
const chains = new Map<string, Promise<void>>();

/** 仅供测试：忘掉已经叫过的轮次和排队 */
export function __resetLiveMemoryPostHook(): void {
  seenRounds.clear();
  chains.clear();
}

export function runLiveMemoryPostHook(opts: {
  /** 哪一轮：场次号 + 轮次号，同一个只算一次 */
  roundKey: string;
  charId: string;
  /** 宫殿配置（来自 OSContext 的 memoryPalaceConfig） */
  config: { embedding?: EmbeddingConfig; lightLLM?: LightLLMConfig };
  api: APIConfig;
  userName: string;
  onStatus?: (stage: string) => void;
  onResult?: (result: PipelineResult) => void;
  onError?: (e: unknown) => void;
}): Promise<void> {
  const { roundKey, charId, config, api, userName, onStatus, onResult, onError } = opts;
  if (!charId || !roundKey || seenRounds.has(roundKey)) return Promise.resolve();
  seenRounds.add(roundKey);
  while (seenRounds.size > 2000) seenRounds.delete(seenRounds.values().next().value!);

  const task = (chains.get(charId) || Promise.resolve()).catch(() => {}).then(async () => {
    const live = await DB.getCharacter(charId);
    const emb = config.embedding;
    const llm = config.lightLLM?.baseUrl ? config.lightLLM : api;
    // 开关关着、或向量 / 轻量模型没配：不叫（跟聊天、见面同一套门槛）
    if (!live?.memoryPalaceEnabled || !emb?.baseUrl || !emb.apiKey || !llm.baseUrl) return;

    const recentMsgs = await DB.getRecentMessagesByCharId(charId, 50);
    const result = await processNewMessagesWithAutoArchive(
      recentMsgs,
      charId,
      live.name,
      emb,
      llm,
      userName,
      false,
      stage => onStatus?.(stage),
    );

    // 管线跑的过程中用户可能又关掉宫殿：弹窗和认知消化这些额外动作再 check 一次
    const after = await DB.getCharacter(charId);
    if (!after?.memoryPalaceEnabled) return;
    if (result && result.stored > 0) onResult?.(result);

    if (incrementDigestRound(charId)) {
      onStatus?.('闭上眼睛，开始整理内心…');
      const persona = [after.systemPrompt || '', after.worldview || ''].filter(Boolean).join('\n');
      await runCognitiveDigestion(
        charId,
        after.name,
        persona,
        llm,
        false,
        userName,
        emb,
        stage => onStatus?.(`${stage}`),
      );
    }
  });

  chains.set(charId, task);
  return task
    .catch(e => {
      onError?.(e);
    })
    .finally(() => {
      if (chains.get(charId) === task) chains.delete(charId);
    });
}
