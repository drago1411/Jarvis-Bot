import { filesystemTools } from './filesystem.js';
import { shellTools } from './shell.js';
import { webTools } from './web.js';
import type { ToolDefinition } from '../types.js';
import type { ChatCompletionTool } from 'openai/resources/chat/completions.js';

/**
 * Master registry of all available tools.
 */
export const allTools: ToolDefinition[] = [
  ...filesystemTools,
  ...shellTools,
  ...webTools,
];

/**
 * Converts our ToolDefinition[] into the OpenAI function-calling format.
 */
export function getToolDefinitions(): ChatCompletionTool[] {
  return allTools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

/**
 * Looks up a tool by name and executes it.
 */
export async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  const tool = allTools.find((t) => t.name === name);
  if (!tool) {
    return `❌ Unknown tool: "${name}". Available tools: ${allTools.map((t) => t.name).join(', ')}`;
  }

  try {
    return await tool.execute(args);
  } catch (err) {
    return `❌ Tool "${name}" crashed: ${(err as Error).message}`;
  }
}
