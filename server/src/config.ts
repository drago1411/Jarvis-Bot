import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';

// Load .env from project root (D:\Jarvis\.env)
loadEnv({ path: resolve(import.meta.dirname, '../../.env') });

/**
 * Central configuration — all env vars read here, nowhere else.
 */
export const config = {
  /** Groq API key */
  groqApiKey: process.env.GROQ_API_KEY || '',

  /** Gemini API key (optional fallback for 1M context / zero rate-limits) */
  geminiApiKey: process.env.GEMINI_API_KEY || '',

  /** Ollama base URL (local offline fallback) */
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/v1',

  /** Primary model for orchestrator */
  model: process.env.JARVIS_MODEL || 'llama-3.3-70b-versatile',

  /** Fallback model for simple tasks */
  fallbackModel: process.env.JARVIS_FALLBACK_MODEL || 'llama-3.1-8b-instant',

  /** Gemini model */
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',

  /** Ollama model */
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b',

  /** Server port */
  port: parseInt(process.env.JARVIS_PORT || '3000', 10),

  /** Root directory where all JARVIS projects are created */
  workspaceRoot: process.env.WORKSPACE_ROOT || 'D:\\Jarvis\\workbench\\projects',

  /** Max ReAct iterations before agent gives up */
  maxIterations: 15,

  /** Max command execution timeout (ms) */
  shellTimeout: 30_000,
} as const;

/**
 * Validate required config on startup.
 */
export function validateConfig(): void {
  if (!config.groqApiKey) {
    console.error('❌ GROQ_API_KEY is missing. Add it to D:\\Jarvis\\.env');
    process.exit(1);
  }
  console.log('✅ Config loaded');
  console.log(`   Model: ${config.model}`);
  console.log(`   Workspace: ${config.workspaceRoot}`);
}
