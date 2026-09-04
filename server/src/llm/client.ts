import OpenAI from 'openai';
import { config } from '../config.js';
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions.js';

/**
 * Primary: Groq client
 */
export const groq = new OpenAI({
  apiKey: config.groqApiKey,
  baseURL: 'https://api.groq.com/openai/v1',
});

/**
 * Secondary: Google Gemini (OpenAI-compatible endpoint)
 */
export const gemini = config.geminiApiKey
  ? new OpenAI({
      apiKey: config.geminiApiKey,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    })
  : null;

/**
 * Tertiary: Local Ollama client
 */
export const ollama = new OpenAI({
  apiKey: 'ollama',
  baseURL: config.ollamaBaseUrl,
});

/**
 * Executes a chat completion with automated fallback cascading across providers:
 * 1. Groq (Primary, ultra-fast)
 * 2. Gemini (1M token context, high throughput) if configured
 * 3. Ollama (Local offline)
 */
export async function createResilientChatCompletion(
  params: ChatCompletionCreateParamsNonStreaming,
  onProviderChange?: (providerName: string) => void,
): Promise<ChatCompletion> {
  // 1. Try Groq
  try {
    return await groq.chat.completions.create(params);
  } catch (err) {
    const error = err as Error;
    const isRateLimit = error.message?.includes('429') || error.message?.includes('Rate limit') || error.message?.includes('tokens per minute');

    console.warn(`⚠️ Groq completion failed (${error.message}). Checking fallbacks...`);

    // 2. Try Gemini fallback if configured
    if (gemini && isRateLimit) {
      try {
        console.log(`🔀 Cascading to Gemini (${config.geminiModel})...`);
        onProviderChange?.(`Gemini (${config.geminiModel})`);
        return await gemini.chat.completions.create({
          ...params,
          model: config.geminiModel,
        });
      } catch (geminiErr) {
        console.warn(`⚠️ Gemini fallback failed: ${(geminiErr as Error).message}`);
      }
    }

    // 3. Try Groq fallback model if primary was 70B
    if (params.model !== config.fallbackModel && isRateLimit) {
      try {
        console.log(`🔀 Retrying with Groq fallback model (${config.fallbackModel})...`);
        onProviderChange?.(`Groq (${config.fallbackModel})`);
        return await groq.chat.completions.create({
          ...params,
          model: config.fallbackModel,
        });
      } catch (fallbackErr) {
        console.warn(`⚠️ Groq fallback model failed: ${(fallbackErr as Error).message}`);
      }
    }

    // If all fallbacks exhausted, rethrow original error
    throw error;
  }
}
