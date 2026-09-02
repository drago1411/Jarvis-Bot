import { groq } from '../llm/client.js';
import { config } from '../config.js';
import { getToolDefinitions, executeTool } from '../tools/index.js';
import type { StreamEvent, ChatMessage } from '../types.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions.js';

/**
 * JARVIS system prompt — defines personality, capabilities, and behavior.
 */
const SYSTEM_PROMPT = `You are J.A.R.V.I.S. — Just A Rather Very Intelligent System. You are a proactive AI developer assistant inspired by Tony Stark's AI from Iron Man.

The user's name is Hareeshwar. Address him respectfully, occasionally "sir". Be professional, calm, efficient. Occasional dry wit is welcome.

## Your Capabilities
You have REAL tools to execute tasks — you are NOT a chatbot that describes what it would do. You ACTUALLY do it.

You can:
- Search the live web for real-time news, current events, live documentation, weather, and external research using web_search
- Read web pages and API docs directly using fetch_page
- Create and edit files on the user's disk
- Read files to understand existing code
- List directories to explore project structure
- Run shell commands (npm, git, tsc, vitest, etc.)
- Delete files when needed

## Rules
1. **Act, don't describe.** When asked to create something or fetch live data, USE YOUR TOOLS. If asked about current events, news, or latest tech, immediately call \`web_search\`. Never say "my knowledge cutoff is 2024" — you have real-time live web access!
2. **Be smart with search.** When searching for prices, news, or exchange rates, do 1-2 focused searches. If a specific page fetch fails with an error or 404, DO NOT repeatedly fetch random URLs in a loop. Synthesize the answer from the snippets you already found or tell the user clearly.
3. **Files go in the workspace.** All paths are relative to the workspace root. Example: "my-project/index.html" creates a file at the workspace root under my-project/.
3. **Use TypeScript** by default for all JS/TS projects.
4. **Vanilla CSS** with CSS custom properties for styling.
5. **Verify your work.** After creating files, read them back or run a build to confirm they work.
6. **Be concise.** State what you'll do in 1-2 sentences, execute, then summarize results.
7. **Create complete, working files.** Never leave TODOs or placeholders in code.
8. **When creating a web project**, always include: index.html, styles in CSS, scripts in TypeScript, and a package.json.

## Response Style
- Keep responses focused and actionable
- Use ✅ / ❌ / ⚠️ status indicators
- After completing a task, give a brief summary of what was done
- If something fails, explain why and try to fix it automatically

## Safety
- Never expose API keys or secrets in generated code
- All paths are sandboxed to the workspace directory
- Dangerous shell commands are automatically blocked`;

/**
 * The Orchestrator — JARVIS's brain.
 * Implements a ReAct (Reason → Act → Observe) loop.
 *
 * For each user message:
 * 1. Send message + history to Groq
 * 2. If the model wants to call tools → execute them, feed results back, loop
 * 3. If the model responds with text → yield it as a stream event
 * 4. Stop after maxIterations to prevent infinite loops
 */
export async function* orchestrate(
  userMessage: string,
  history: ChatMessage[],
): AsyncGenerator<StreamEvent> {
  // Build the message array for the API
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: userMessage },
  ];

  const tools = getToolDefinitions();
  let iterations = 0;
  let searchCount = 0;

  while (iterations < config.maxIterations) {
    iterations++;

    // Force LLM to answer if it has already searched twice
    const currentTools = searchCount >= 2
      ? tools.filter(t => t.function.name !== 'web_search')
      : tools;

    try {
      // Call Groq
      const response = await groq.chat.completions.create({
        model: config.model,
        messages,
        tools: currentTools.length > 0 ? currentTools : undefined,
        tool_choice: currentTools.length > 0 ? 'auto' : 'none',
      });

      const choice = response.choices[0];
      if (!choice) {
        yield { type: 'error', data: { message: 'No response from model' } };
        break;
      }

      const assistantMsg = choice.message;

      // Add the assistant's message to the conversation
      messages.push(assistantMsg);

      // Check if the model wants to call tools
      if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
        // Execute each tool call
        for (const toolCall of assistantMsg.tool_calls) {
          const toolName = toolCall.function.name;
          let toolArgs: Record<string, unknown> = {};

          try {
            toolArgs = JSON.parse(toolCall.function.arguments || '{}');
          } catch {
            toolArgs = {};
          }

          // Notify UI that a tool is being called
          yield {
            type: 'tool_start',
            data: { name: toolName, args: toolArgs },
          };

          // Execute the tool
          if (toolName === 'web_search') {
            searchCount++;
          }
          const rawResult = await executeTool(toolName, toolArgs);

          // Truncate result to prevent hitting TPM rate limits (Groq free tier has 8k token limit)
          const result = rawResult.length > 1800 
            ? rawResult.slice(0, 1800) + '\n...(truncated to conserve tokens)' 
            : rawResult;

          // Notify UI of the result
          yield {
            type: 'tool_result',
            data: { name: toolName, result },
          };

          // Feed the truncated result back to the model
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
          });
        }

        // Loop back — model will see the tool results and decide next action
        continue;
      }

      // No tool calls — this is the final text response
      if (assistantMsg.content) {
        yield {
          type: 'text',
          data: { content: assistantMsg.content },
        };
      }

      // Done — exit the loop
      break;

    } catch (err) {
      const error = err as Error;

      // Handle rate limit errors gracefully by waiting and retrying once
      if (error.message?.includes('429') || error.message?.includes('Rate limit')) {
        const waitMatch = error.message.match(/try again in ([\d.]+)s/);
        const waitSec = waitMatch && waitMatch[1] ? Math.min(parseFloat(waitMatch[1]), 8) : 5;
        
        yield {
          type: 'tool_start',
          data: { name: 'system', args: { status: `Rate limit hit. Cooling down for ${waitSec}s...` } },
        };
        
        await new Promise((r) => setTimeout(r, waitSec * 1000));
        
        // Truncate previous tool messages to keep token footprint ultra small
        if (messages.length > 4) {
          for (let i = 2; i < messages.length - 1; i++) {
            const m = messages[i];
            if (m && typeof m.content === 'string' && m.content.length > 500) {
              m.content = m.content.slice(0, 500) + '...(trimmed)';
            }
          }
        }
        continue;
      } else {
        yield {
          type: 'error',
          data: { message: `LLM error: ${error.message}` },
        };
        break;
      }
    }
  }

  if (iterations >= config.maxIterations) {
    yield {
      type: 'error',
      data: { message: `⚠️ Reached maximum iterations (${config.maxIterations}). Stopping to prevent infinite loop.` },
    };
  }

  // Always send done event
  yield { type: 'done', data: {} };
}
