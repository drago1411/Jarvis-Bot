import OpenAI from 'openai';
import { config } from '../config.js';

/**
 * OpenAI-compatible client pointed at Groq.
 * Groq's API is 100% OpenAI-compatible, so we use the official SDK.
 */
export const groq = new OpenAI({
  apiKey: config.groqApiKey,
  baseURL: 'https://api.groq.com/openai/v1',
});
