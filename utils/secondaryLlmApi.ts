import type { ApiPreset, SecondaryLlmApiConfig } from '../types';
import { normalizeApiBaseUrl, normalizeApiCredential, normalizeApiModel } from './apiConfigNormalize';

export const secondaryLlmConfigFromPreset = (preset: ApiPreset, enabled = true): SecondaryLlmApiConfig => ({
    enabled,
    baseUrl: normalizeApiBaseUrl(preset.config.baseUrl),
    apiKey: normalizeApiCredential(preset.config.apiKey),
    model: normalizeApiModel(preset.config.model),
});

export function isSecondaryLlmReady(config?: SecondaryLlmApiConfig | null): boolean {
    return !!(
        config?.enabled
        && config.baseUrl?.trim()
        && config.apiKey?.trim()
        && config.model?.trim()
    );
}
