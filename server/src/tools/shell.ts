import { exec } from 'child_process';
import { resolve, normalize, relative, isAbsolute } from 'path';
import { config } from '../config.js';
import type { ToolDefinition, ToolExecutionContext } from '../types.js';

/**
 * Commands that are always safe to run without confirmation.
 */
const SAFE_PREFIXES: RegExp[] = [
  /^npm\s+(install|ci|run|test|init|create|ls|list|outdated|audit|pack)\b/,
  /^npx\s+([a-zA-Z0-9_-]+)/,
  /^node\s+([a-zA-Z0-9_\-./\\]+)/,
  /^tsc\b/,
  /^vitest\b/,
  /^git\s+(status|add|commit|log|diff|branch|show|tag)\b/,
  /^(dir|ls|cat|type|echo|mkdir|pwd|where|which|hostname)\b/,
  /^(cd|pushd|popd)\s/,
];

/**
 * Commands that are NEVER allowed or always require strict confirmation.
 */
const DANGEROUS_PATTERNS: RegExp[] = [
  /rm\s+(-rf|--recursive)/i,
  /rmdir\s+(\/s|-s)/i,
  /del\s+(\/[sfq]|-s|-f|-q)/i,
  /remove-item\b.*(-recurse|-force)/i,
  /format\s+[a-z]:/i,
  /git\s+push\s+.*--force/i,
  /git\s+reset\s+--hard/i,
  /drop\s+(table|database)/i,
  /truncate\s+table/i,
  /shutdown/i,
  /taskkill\s+(\/f|-f)/i,
  /\b(iex|invoke-expression)\b/i,
  /\bpowershell(\.exe)?\s+.*(-enc|-encodedcommand|-e\b)/i,
];

/**
 * Classifies a command as safe, blocked, or needs-confirmation.
 */
function classifyCommand(command: string): 'safe' | 'blocked' | 'confirm' {
  const trimmed = command.trim();

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) return 'confirm';
  }

  // Chained or piped statements should require confirmation
  if (/[;&|\n]/.test(trimmed)) {
    return 'confirm';
  }

  for (const pattern of SAFE_PREFIXES) {
    if (pattern.test(trimmed)) return 'safe';
  }

  return 'confirm';
}

/**
 * Executes a shell command and returns stdout + stderr.
 */
function runCommand(command: string, cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolveResult) => {
    const child = exec(command, {
      cwd,
      timeout: config.shellTimeout,
      maxBuffer: 1024 * 1024, // 1MB
      shell: 'powershell.exe',
    }, (error, stdout, stderr) => {
      resolveResult({
        stdout: stdout ? stdout.toString().trim() : '',
        stderr: stderr ? stderr.toString().trim() : '',
        code: error?.code ?? 0,
      });
    });
  });
}

/**
 * Optional legacy fallback hook for interactive command approval.
 */
export let onCommandApprovalRequired: ((command: string, dir: string) => Promise<boolean>) | null = null;

export function setApprovalHandler(handler: ((command: string, dir: string) => Promise<boolean>) | null) {
  onCommandApprovalRequired = handler;
}

/**
 * TOOL: run_shell
 * Runs a shell command (PowerShell) in the workspace directory.
 */
async function runShellHandler(args: Record<string, unknown>, context?: ToolExecutionContext): Promise<string> {
  const command = args['command'] as string;
  const subdir = (args['directory'] as string) || '.';

  if (!command || command.trim().length === 0) {
    return '❌ Error: No command provided.';
  }

  const rootResolved = resolve(normalize(config.workspaceRoot));
  const targetCwd = resolve(rootResolved, subdir);
  const rel = relative(rootResolved.toLowerCase(), targetCwd.toLowerCase());
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return `❌ Error: Directory "${subdir}" escapes the workspace boundary.`;
  }

  const safety = classifyCommand(command);

  // If command requires confirmation, ask for user approval
  if (safety === 'blocked' || safety === 'confirm') {
    const approvalHandler = context?.requestApproval || onCommandApprovalRequired;
    if (approvalHandler) {
      const approved = await approvalHandler(command, subdir);
      if (!approved) {
        return `🚫 USER DENIED: Execution of "${command}" was rejected by the user in the HUD security modal.`;
      }
    }
  }

  try {
    const { stdout, stderr, code } = await runCommand(command, targetCwd);

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
    description: 'Run a shell command (PowerShell) in the workspace. Use for npm, git, tsc, vitest, etc. Directory is relative to workspace root.',
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
