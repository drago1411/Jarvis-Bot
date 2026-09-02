import { exec } from 'child_process';
import { config } from '../config.js';
import type { ToolDefinition } from '../types.js';

/**
 * Commands that are always safe to run without confirmation.
 */
const SAFE_PATTERNS: RegExp[] = [
  /^npm\s+(install|ci|run|test|init|create|ls|list|outdated|audit|pack)/,
  /^npx\s/,
  /^node\s/,
  /^tsc/,
  /^vitest/,
  /^git\s+(status|add|commit|log|diff|branch|show|tag)/,
  /^(dir|ls|cat|type|echo|mkdir|pwd|where|which|hostname)\b/,
  /^(cd|pushd|popd)\s/,
];

/**
 * Commands that are NEVER allowed — too destructive.
 */
const BLOCKED_PATTERNS: RegExp[] = [
  /rm\s+(-rf|--recursive).*\//,
  /rmdir\s+\/s/i,
  /del\s+\/[sfq]/i,
  /format\s+[a-z]:/i,
  /git\s+push\s+.*--force/,
  /git\s+reset\s+--hard/,
  /drop\s+(table|database)/i,
  /truncate\s+table/i,
  /shutdown/i,
  /taskkill\s+\/f/i,
];

/**
 * Classifies a command as safe, blocked, or needs-confirmation.
 */
function classifyCommand(command: string): 'safe' | 'blocked' | 'confirm' {
  const trimmed = command.trim().toLowerCase();

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) return 'blocked';
  }

  for (const pattern of SAFE_PATTERNS) {
    if (pattern.test(trimmed)) return 'safe';
  }

  return 'confirm';
}

/**
 * Executes a shell command and returns stdout + stderr.
 */
function runCommand(command: string, cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = exec(command, {
      cwd,
      timeout: config.shellTimeout,
      maxBuffer: 1024 * 1024, // 1MB
      shell: 'powershell.exe',
    }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout.toString().trim(),
        stderr: stderr.toString().trim(),
        code: error?.code ?? 0,
      });
    });
  });
}

/**
 * TOOL: run_shell
 * Runs a shell command in the workspace directory.
 */
async function runShellHandler(args: Record<string, unknown>): Promise<string> {
  const command = args['command'] as string;
  const subdir = (args['directory'] as string) || '.';

  if (!command || command.trim().length === 0) {
    return '❌ Error: No command provided.';
  }

  const safety = classifyCommand(command);

  if (safety === 'blocked') {
    return `🚫 BLOCKED: "${command}" is too dangerous. This command could cause data loss. Refusing to execute.`;
  }

  if (safety === 'confirm') {
    // For Phase 1, we auto-run with a warning. Phase 2 will add real confirmation.
    console.warn(`⚠️  Running unclassified command: ${command}`);
  }

  const cwd = `${config.workspaceRoot}${subdir === '.' ? '' : `\\${subdir}`}`;

  try {
    const { stdout, stderr, code } = await runCommand(command, cwd);

    const parts: string[] = [];
    parts.push(`$ ${command}`);
    parts.push(`Exit code: ${code}`);

    if (stdout) parts.push(`\nSTDOUT:\n${stdout.slice(0, 4000)}`);
    if (stderr) parts.push(`\nSTDERR:\n${stderr.slice(0, 2000)}`);

    if (code !== 0) {
      parts.push(`\n❌ Command failed with exit code ${code}`);
    } else {
      parts.push(`\n✅ Command completed successfully`);
    }

    return parts.join('\n');
  } catch (err) {
    return `❌ Failed to execute "${command}": ${(err as Error).message}`;
  }
}

/**
 * Shell tool definitions.
 */
export const shellTools: ToolDefinition[] = [
  {
    name: 'run_shell',
    description: 'Run a shell command (PowerShell) in the workspace. Use for npm, git, tsc, vitest, etc. Dangerous commands (rm -rf, format, etc.) are automatically blocked. Directory is relative to workspace root.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute (e.g., "npm install", "git status")',
        },
        directory: {
          type: 'string',
          description: 'Subdirectory within workspace to run the command in (default: workspace root). Example: "my-project"',
        },
      },
      required: ['command'],
    },
    execute: runShellHandler,
  },
];
