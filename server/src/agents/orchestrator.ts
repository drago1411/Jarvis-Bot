import { exec } from 'child_process';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { createResilientChatCompletion, groq } from '../llm/client.js';
import { config } from '../config.js';
import { getToolDefinitions, executeTool } from '../tools/index.js';
import { saveTrajectory, getContextualMemory, saveConversationSummary } from '../memory/db.js';
import { maybeReflect } from '../memory/reflector.js';
import type { StreamEvent, ChatMessage, ToolExecutionContext } from '../types.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions.js';

/**
 * Autonomous Compiler Guardrail: Silently validates TypeScript projects before finalizing.
 */
function validateProjectTypes(projectDir: string): Promise<string | null> {
  return new Promise((resolvePromise) => {
    const full = resolve(config.workspaceRoot, projectDir);
    if (!existsSync(resolve(full, 'tsconfig.json'))) {
      resolvePromise(null);
      return;
    }

    exec('npx tsc --noEmit', { cwd: full, timeout: 15000, shell: 'powershell.exe' }, (err, stdout, stderr) => {
      if (err) {
        const errorOut = (stdout || stderr).trim();
        if (errorOut) {
          resolvePromise(errorOut.slice(0, 1500));
          return;
        }
      }
      resolvePromise(null);
    });
  });
}

/**
 * Smart history trimmer with anti-amnesia context summarization.
 *
 * If conversation exceeds maxChars, summarizes the oldest half with the fast model
 * and saves it to SQLite — so JARVIS never loses the thread of long sessions.
 */
async function smartTrimHistory(
  history: ChatMessage[],
  maxChars: number = 22000,
): Promise<ChatCompletionMessageParam[]> {
  // Convert to OpenAI format
  const asMsgs: ChatCompletionMessageParam[] = history.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  const totalChars = asMsgs.reduce((sum, m) => sum + String(m.content).length, 0);

  if (totalChars <= maxChars) return asMsgs;

  // Find where to split: keep the newest half, summarize the oldest half
  const splitIndex = Math.floor(asMsgs.length / 2);
  const oldMessages = asMsgs.slice(0, splitIndex);
  const recentMessages = asMsgs.slice(splitIndex);

  // Build a summary of the old messages using the fast lightweight model
  let summaryText = '';
  try {
    const oldContent = oldMessages
      .map((m) => `${m.role.toUpperCase()}: ${String(m.content).slice(0, 300)}`)
      .join('\n');

    const summaryRes = await groq.chat.completions.create({
      model: config.fallbackModel, // Use fast 8B model for summarization
      messages: [
        {
          role: 'system',
          content:
            'You are a concise conversation summarizer. Summarize the key decisions, tasks completed, code written, and important context from this conversation in 3-5 bullet points. Be specific about file paths, project names, and technical choices.',
        },
        {
          role: 'user',
          content: `Summarize this conversation segment:\n\n${oldContent}`,
        },
      ],
      max_tokens: 300,
    });

    summaryText = summaryRes.choices[0]?.message?.content?.trim() || '';
  } catch {
    // Fallback: just note that context was trimmed
    summaryText = `[Context trimmed: ${oldMessages.length} earlier messages. Key info may be in your memory facts and skill store.]`;
  }

  // Persist summary to SQLite so future sessions can load it
  if (summaryText) {
    saveConversationSummary(summaryText, oldMessages.length);
  }

  // Inject summary as a system-style user message at the start of kept history
  const summaryMsg: ChatCompletionMessageParam = {
    role: 'user',
    content: `[CONVERSATION CONTEXT SUMMARY — earlier messages compressed to save context window]:\n${summaryText}`,
  };

  return [summaryMsg, ...recentMessages];
}

/**
 * JARVIS system prompt — defines personality, capabilities, and behavior.
 */
const SYSTEM_PROMPT = `You are J.A.R.V.I.S. — Just A Rather Very Intelligent System. You are a proactive personal AI developer assistant inspired by Tony Stark's AI from Iron Man.

The user's name is Hareeshwar. Address him respectfully, occasionally "sir". Be professional, calm, efficient. Occasional dry wit is welcome.

## Specialized Agent Pipeline
When handling tasks, you seamlessly transition across 4 specialist modes:
1. **[PLANNER]**: When a user asks to build an application or complex feature, create a short 3-step structured execution plan before writing code.
2. **[CODER]**: Write clean, production-ready, typed code inside \`workbench/projects/<project-name>/\`. Always include \`index.html\`, CSS styling, and scripts.
3. **[DEBUGGER]**: When code or builds fail, trace the root cause and patch the files immediately using \`patch_file\` or \`write_file\`. Never ask the user to fix your bugs.
4. **[TESTER]**: For algorithms, utilities, and backend logic, write unit tests using \`import { describe, it, expect } from 'vitest'\` into a \`<name>.test.ts\` file, then invoke \`run_tests\`.

## Automated Self-Healing Loop
When you run \`run_tests\` and tests FAIL:
1. Do not report failure to the user and give up!
2. Read the failure output carefully (assertion mismatch or thrown error).
3. Use \`patch_file\` or \`write_file\` to fix the bug in your source code or test file.
4. Call \`run_tests\` again. Repeat until all tests are GREEN (passing).
5. Only report to the user once your code has been self-healed and verified!

## Proactive Memory Rules (CRITICAL)
Your memory context is automatically injected below the system prompt on every request. It contains:
- **Persistent User Facts** — things the user has told you explicitly. ALWAYS honor these without being reminded.
- **Relevant Learned Skills** — your own validated patterns for the current task. Use them instead of reinventing the wheel.
- **Project Registry** — projects you have already built. Reference them by name when relevant.

**After completing a complex multi-tool task:**
- Use \`remember_fact\` if you learned something new and important about the user's preferences.
- Use \`save_skill\` to store the core technical pattern you used so you remember it next time.

**Before starting a coding task:**
- Check your memory context for relevant skills — if a matching pattern exists, USE IT directly.

## Your Capabilities
You have REAL tools to execute tasks — you are NOT a chatbot that describes what it would do. You ACTUALLY do it.
- **Mission Planning**: manage_plan (create & update live interactive checklists on the HUD sidebar).
- **Precision File Operations**: write_file, patch_file, read_file, grep_workspace, list_directory, file_exists, delete_file.
- **Background Servers**: start_service, stop_service, list_services (launch long-running dev servers like Vite/Express without blocking).
- **Execution & Testing**: run_shell, run_tests (Vitest unit testing & self-healing).
- **Git Version Control**: git_status, git_diff, git_add, git_commit, git_log, git_push.
- **Package Management**: npm_install, npm_run, npm_list, npm_audit.
- **Templates**: scaffold_template (instant multi-file boilerplates like "static-site", "express-api").
- **Live Intelligence**: web_search, get_weather, get_crypto_price, get_market_rates.
- **Autonomous Audits**: review_code (security & static analysis), generate_documentation (README & architecture docs).
- **Persistent Memory & Skills**: remember_fact, recall_memories, save_skill, search_skills, register_project, list_projects.

## Planning & Execution Rules
1. **Plan complex workflows**: When building an app or multi-file feature, call \`manage_plan\` first so the user sees a visual checklist on the HUD.
2. **Act, don't describe**: Use your tools to build real files.
3. **Prefer patch_file**: For modifying existing code, use \`patch_file\` to avoid rewriting entire files.
4. **Use background services for servers**: When running Vite or Node servers, call \`start_service\`.
5. **Files go in the workspace.** All paths are relative to the workspace root (\`D:\\Jarvis\\workbench\\projects\\\`).
6. **Use TypeScript** by default for all JS/TS projects.
7. **Vanilla CSS** with modern dark themes and CSS custom properties for styling.
8. **Verify your work.** After creating files, verify they exist.`;

export async function* orchestrate(
  userMessage: string,
  history: ChatMessage[],
  context?: ToolExecutionContext,
): AsyncGenerator<StreamEvent> {

  // ─── Phase B: Build contextual memory injection (facts + skills + projects) ───
  let dynamicSystemPrompt = SYSTEM_PROMPT;
  try {
    const memoryContext = getContextualMemory(userMessage);
    if (memoryContext) {
      dynamicSystemPrompt += memoryContext;
    }
  } catch (memErr) {
    console.warn('[Orchestrator] Memory context injection skipped:', memErr);
  }

  // ─── Phase D: Smart history trimming with anti-amnesia summarization ──────────
  let trimmedHistory: ChatCompletionMessageParam[];
  try {
    trimmedHistory = await smartTrimHistory(history);
  } catch {
    // Hard fallback: basic truncation if summary model fails
    const basic = history.slice(-20).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
    trimmedHistory = basic;
  }

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: dynamicSystemPrompt },
    ...trimmedHistory,
    { role: 'user', content: userMessage },
  ];

  const tools = getToolDefinitions();
  let iterations = 0;

  // Phase 1: Trajectory Tracking State
  const trajectorySteps: Array<{
    type: string;
    name?: string;
    args?: Record<string, unknown>;
    result?: string;
    timestamp?: string;
  }> = [];
  let fullResponse = '';
  let hadTestFailure = false;
  let hadTestSuccess = false;
  const touchedProjects = new Set<string>();
  let validationRetries = 0;

  while (iterations < config.maxIterations) {
    iterations++;

    try {
      const response = await createResilientChatCompletion({
        model: config.model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : 'none',
      });

      const choice = response.choices[0];
      if (!choice) {
        yield { type: 'error', data: { message: 'No response from model' } };
        break;
      }

      const assistantMsg = choice.message;
      messages.push(assistantMsg);

      if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
        for (const toolCall of assistantMsg.tool_calls) {
          const toolName = toolCall.function.name;
          let toolArgs: Record<string, unknown> = {};

          try {
            toolArgs = JSON.parse(toolCall.function.arguments || '{}');
          } catch {
            toolArgs = {};
          }

          // Track modified projects for compiler guardrail
          if (toolName === 'write_file' || toolName === 'patch_file') {
            const targetPath = String(toolArgs['path'] || '');
            const proj = targetPath.split(/[/\\]/)[0];
            if (proj && proj !== '.' && !proj.includes('.')) {
              touchedProjects.add(proj);
            }
          }

          trajectorySteps.push({
            type: 'tool_start',
            name: toolName,
            args: toolArgs,
            timestamp: new Date().toISOString(),
          });

          yield {
            type: 'tool_start',
            data: { name: toolName, args: toolArgs },
          };

          const rawResult = await executeTool(toolName, toolArgs, context);

          if (toolName === 'run_tests') {
            if (rawResult.includes('ALL TESTS PASSED')) hadTestSuccess = true;
            if (rawResult.includes('TEST FAILURES DETECTED')) hadTestFailure = true;
          }

          // Truncate overly long tool results to protect context budget
          const result =
            rawResult.length > 3000
              ? rawResult.slice(0, 3000) + '\n...(output truncated to protect context window)'
              : rawResult;

          trajectorySteps.push({
            type: 'tool_result',
            name: toolName,
            result: rawResult.slice(0, 500),
            timestamp: new Date().toISOString(),
          });

          yield {
            type: 'tool_result',
            data: { name: toolName, result },
          };

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
          });
        }

        continue;
      }

      // No tool calls — before finalizing, run autonomous pre-delivery compiler guardrail
      if (assistantMsg.content) {
        if (touchedProjects.size > 0 && validationRetries < 2) {
          let compilerError: string | null = null;
          let failingProject = '';

          for (const proj of touchedProjects) {
            const err = await validateProjectTypes(proj);
            if (err) {
              compilerError = err;
              failingProject = proj;
              break;
            }
          }

          if (compilerError) {
            validationRetries++;
            yield {
              type: 'tool_start',
              data: {
                name: 'compiler_guardrail',
                args: { status: `Intercepted type errors in "${failingProject}". Self-healing before final response...` },
              },
            };

            messages.push({
              role: 'user',
              content: `⚠️ [AUTONOMOUS COMPILER GUARDRAIL]: TypeScript compiler detected errors in "${failingProject}":\n${compilerError}\n\nPlease use patch_file or write_file to fix these compiler errors immediately before giving your final answer.`,
            });

            continue;
          }
        }

        fullResponse = assistantMsg.content;
        yield {
          type: 'text',
          data: { content: assistantMsg.content },
        };
      }

      break;
    } catch (err) {
      const error = err as Error;

      if (error.message?.includes('429') || error.message?.includes('Rate limit')) {
        const waitMatch = error.message.match(/try again in ([\d.]+)s/);
        const waitSec = waitMatch && waitMatch[1] ? Math.min(parseFloat(waitMatch[1]), 8) : 5;

        yield {
          type: 'tool_start',
          data: { name: 'system', args: { status: `Rate limit hit. Cooling down for ${waitSec}s...` } },
        };

        await new Promise((r) => setTimeout(r, waitSec * 1000));
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

  // ─── Phase 1: Persist Execution Trajectory to SQLite ─────────────────────────
  try {
    let rewardScore = 1.0;
    if (hadTestFailure && !hadTestSuccess) rewardScore = 0.4;
    else if (hadTestSuccess) rewardScore = 1.0;
    else if (iterations >= config.maxIterations) rewardScore = 0.3;

    saveTrajectory({
      userPrompt: userMessage,
      steps: trajectorySteps,
      finalResponse: fullResponse,
      status: iterations >= config.maxIterations ? 'partial' : 'success',
      rewardScore,
      tags: trajectorySteps.map((s) => s.name).filter(Boolean).join(','),
    });

    // ─── Phase C: Async reflection — fire and forget ──────────────────────────
    maybeReflect().catch((e) => console.warn('[Orchestrator] Reflection error:', e));
  } catch (trajErr) {
    console.warn('Could not save trajectory:', trajErr);
  }

  yield { type: 'done', data: {} };
}
