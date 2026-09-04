import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions.js';

/**
 * A single event streamed from the server to the UI via SSE.
 */
export interface StreamEvent {
  type: 'text' | 'tool_start' | 'tool_result' | 'task_plan' | 'error' | 'done';
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
 * Context passed to tool execution (per-request state such as approval callbacks).
 */
export interface ToolExecutionContext {
  requestApproval?: (command: string, dir: string) => Promise<boolean>;
  emitTaskPlan?: (plan: { tasks: Array<{ id: string; title: string; status: 'pending' | 'in_progress' | 'completed' }>; progressPct: number }) => void;
}

/**
 * A tool definition that agents can use.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>, context?: ToolExecutionContext) => Promise<string>;
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
