import { exec } from 'child_process';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { config } from '../config.js';
import type { ToolDefinition } from '../types.js';

/**
 * Executes Vitest against a specific directory or file.
 */
function executeVitest(projectDir: string, testFile?: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolvePromise) => {
    const target = testFile ? `"${testFile}"` : '';
    const cmd = `npx vitest run ${target} --reporter=verbose`;

    exec(cmd, {
      cwd: projectDir,
      timeout: 30000,
      shell: 'powershell.exe',
    }, (error, stdout, stderr) => {
      resolvePromise({
        stdout: stdout.toString().trim(),
        stderr: stderr.toString().trim(),
        code: error?.code ?? 0,
      });
    });
  });
}

/**
 * TOOL: run_tests
 * Runs Vitest on the designated project.
 */
async function runTestsHandler(args: Record<string, unknown>): Promise<string> {
  const projectPath = (args['project'] as string) || '.';
  const testFile = args['test_file'] as string | undefined;

  const resolved = resolve(config.workspaceRoot, projectPath);
  if (!existsSync(resolved)) {
    return `❌ Error: Project folder does not exist at ${resolved}`;
  }

  try {
    const { stdout, stderr, code } = await executeVitest(resolved, testFile);

    // Clean and summarize the output
    const cleanOutput = (stdout || stderr).slice(0, 3000);

    if (code === 0) {
      return `✅ ALL TESTS PASSED:\n\n${cleanOutput}`;
    } else {
      return `❌ TEST FAILURES DETECTED (Exit code: ${code}):\n\n${cleanOutput}\n\n⚠️ Action Required: Inspect the failing test assertions above, identify the bug in the source file, patch it, and re-run run_tests!`;
    }
  } catch (err) {
    return `❌ Failed to execute tests: ${(err as Error).message}`;
  }
}

export const testerTools: ToolDefinition[] = [
  {
    name: 'run_tests',
    description: 'Execute Vitest unit tests in a project directory. Automatically catches test failures, assertion mismatches, and errors so you can debug and self-heal.',
    parameters: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project folder relative to workbench/projects/ (e.g. "calculator-app" or "my-api")',
        },
        test_file: {
          type: 'string',
          description: 'Optional specific test file to run (e.g. "math.test.ts")',
        },
      },
      required: ['project'],
    },
    execute: runTestsHandler,
  },
];
