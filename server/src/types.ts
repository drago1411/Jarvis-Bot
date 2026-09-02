import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions.js';

/**
 * A single event streamed from the server to the UI via SSE.
 */
export interface StreamEvent {
  type: 'text' | 'tool_start' | 'tool_result' | 'error' | 'done';
  data: Record<string, unknown>;
}

/**
 * A chat message stored in conversation history.
 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * A tool definition that agents can use.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

/**
 * Configuration for an agent.
 */
export interface AgentConfig {
  name: string;
  systemPrompt: string;
  model: string;
  tools: ToolDefinition[];
  maxIterations: number;
}

/**
 * Re-export for convenience.
 */
export type { ChatCompletionMessageParam };
