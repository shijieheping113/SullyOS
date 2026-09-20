import type { SecondaryLlmApiConfig } from '../types';
import { extractContent, safeFetchJson, type StreamHooks } from './safeApi';

export class SecondaryLlmNotConfiguredError extends Error {
    constructor() {
        super('secondary-llm-not-configured');
        this.name = 'SecondaryLlmNotConfiguredError';
    }
}

function isTemperatureUnsupportedError(message: string): boolean {
    const m = message.toLowerCase();
    return m.includes('temperature')
        || m.includes('unsupported')
        || m.includes('unknown')
        || m.includes('invalid') && m.includes('param');
}

type ChatMessage = { role: string; content: string };

/** 副 API 修格式等：默认流式，便于首字到达时给用户「连上了」反馈 */
export const SECONDARY_LLM_TIMEOUT_MS = 80_000;

export type SecondaryLlmCallOpts = {
    config: SecondaryLlmApiConfig;
    purpose: string;
    messages: ChatMessage[];
    featureOpts?: { temperature?: number };
    charId?: string;
    streamHooks?: StreamHooks;
    /** 缺省仍用修格式 80 秒；长按外语翻译等可传入更短超时。 */
    timeoutMs?: number;
};

export async function secondaryLlmCall(opts: SecondaryLlmCallOpts): Promise<string> {
    const { config, purpose, messages, featureOpts, charId, streamHooks } = opts;
    if (!config.enabled || !config.baseUrl?.trim() || !config.apiKey?.trim() || !config.model?.trim()) {
        throw new SecondaryLlmNotConfiguredError();
    }
    const baseUrl = config.baseUrl.replace(/\/+$/, '');
    const url = `${baseUrl}/chat/completions`;
    const timeoutMs = typeof opts.timeoutMs === 'number' && opts.timeoutMs > 0
        ? opts.timeoutMs
        : SECONDARY_LLM_TIMEOUT_MS;

    const attempt = async (includeTemperature: boolean) => {
        const body: Record<string, unknown> = {
            model: config.model,
            stream: true,
            messages,
        };
        if (includeTemperature && typeof featureOpts?.temperature === 'number') {
            body.temperature = featureOpts.temperature;
        }
        const data = await safeFetchJson(
            url,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config.apiKey}`,
                },
                body: JSON.stringify(body),
            },
            1,
            timeoutMs,
            { appId: 'chat', charId, purpose },
            streamHooks,
        );
        return extractContent(data);
    };

    const temp = featureOpts?.temperature;
    if (typeof temp === 'number') {
        try {
            return await attempt(true);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (isTemperatureUnsupportedError(msg)) {
                return await attempt(false);
            }
            throw e;
        }
    }
    return await attempt(false);
}
