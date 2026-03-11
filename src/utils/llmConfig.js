/**
 * Shared LLM configuration for generators. Reads MODEL, TEMPERATURE, TOP_P, MAX_OUTPUT_TOKENS from env.
 * Top P (nucleus sampling) ~0.9 keeps the model considering a diverse enough set of tokens while staying coherent.
 * @module utils/llmConfig
 */

/** Base default config: model, temperature 0, topP 0.9, maxOutputTokens. */
export const DEFAULT_LLM_CONFIG = {
    model: 'gemini-2.5-flash-lite',
    temperature: 0.1,
    topP: 0.9,
    maxOutputTokens: 8192
};

/**
 * Returns LLM config merged from base defaults, optional overrides, and env (MODEL, TEMPERATURE, TOP_P, MAX_OUTPUT_TOKENS).
 * @param {Partial<typeof DEFAULT_LLM_CONFIG>} [overrides] - Optional overrides (e.g. { temperature: 0.1 } for code gen)
 * @returns {{ model: string, temperature: number, topP: number, maxOutputTokens: number }}
 */
export function getLLMConfig(overrides = {}) {
    const base = { ...DEFAULT_LLM_CONFIG, ...overrides };
    return {
        model: process.env.MODEL ?? base.model,
        temperature: Number(process.env.TEMPERATURE ?? base.temperature),
        topP: Number(process.env.TOP_P ?? base.topP),
        maxOutputTokens: Number(process.env.MAX_OUTPUT_TOKENS ?? base.maxOutputTokens)
    };
}
