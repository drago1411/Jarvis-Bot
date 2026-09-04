import { exec } from 'child_process';
import { config } from '../config.js';
import type { ToolDefinition } from '../types.js';

/**
 * Run a git command in the workspace root.
 */
function runGit(args: string, cwd?: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    exec(`git ${args}`, {
      cwd: cwd || config.workspaceRoot,
      timeout: 15000,
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

async function gitStatusHandler(args: Record<string, unknown>): Promise<string> {
  const dir = (args['directory'] as string) || config.workspaceRoot;
  const { stdout, stderr, code } = await runGit('status --short', dir);
  if (code !== 0) return `❌ Git error: ${stderr}`;
  return stdout || '✅ Working tree clean — nothing to commit.';
}

async function gitDiffHandler(args: Record<string, unknown>): Promise<string> {
  const file = (args['file'] as string) || '';
  const staged = args['staged'] ? '--cached ' : '';
  const { stdout, stderr, code } = await runGit(`diff ${staged}${file}`);
  if (code !== 0) return `❌ Git error: ${stderr}`;
  return stdout ? stdout.slice(0, 2000) : 'No differences found.';
}

async function gitAddHandler(args: Record<string, unknown>): Promise<string> {
  const files = (args['files'] as string) || '.';
  const { stdout, stderr, code } = await runGit(`add ${files}`);
  if (code !== 0) return `❌ Git add error: ${stderr}`;
  return `✅ Staged: ${files}`;
}

async function gitCommitHandler(args: Record<string, unknown>): Promise<string> {
  const message = (args['message'] as string) || 'JARVIS auto-commit';
  const { stdout, stderr, code } = await runGit(`commit -m "${message.replace(/"/g, '\\"')}"`);
  if (code !== 0) return `❌ Git commit error: ${stderr}`;
  return `✅ Committed: ${stdout}`;
}

async function gitLogHandler(args: Record<string, unknown>): Promise<string> {
  const count = (args['count'] as number) || 5;
  const { stdout, stderr, code } = await runGit(`log --oneline -${count}`);
  if (code !== 0) return `❌ Git log error: ${stderr}`;
  return stdout || 'No commits found.';
}

async function gitPushHandler(args: Record<string, unknown>): Promise<string> {
  const remote = (args['remote'] as string) || 'origin';
  const branch = (args['branch'] as string) || 'main';
  const { stdout, stderr, code } = await runGit(`push ${remote} ${branch}`);
  if (code !== 0) return `❌ Git push error: ${stderr}`;
  return `✅ Pushed to ${remote}/${branch}: ${stdout || stderr}`;
}

export const gitTools: ToolDefinition[] = [
  {
    name: 'git_status',
    description: 'Show the working tree status (modified, staged, untracked files).',
    parameters: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Optional directory path' },
      },
      required: [],
    },
    execute: gitStatusHandler,
  },
  {
    name: 'git_diff',
    description: 'Show file changes (diff). Use staged=true for staged changes.',
    parameters: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Optional specific file to diff' },
        staged: { type: 'boolean', description: 'If true, shows staged diff' },
      },
      required: [],
    },
    execute: gitDiffHandler,
  },
  {
    name: 'git_add',
    description: 'Stage files for commit. Use "." to stage everything.',
    parameters: {
      type: 'object',
      properties: {
        files: { type: 'string', description: 'Files to stage (e.g. "." or "src/index.ts")' },
      },
      required: ['files'],
    },
    execute: gitAddHandler,
  },
  {
    name: 'git_commit',
    description: 'Create a commit with the given message.',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The commit message' },
      },
      required: ['message'],
    },
    execute: gitCommitHandler,
  },
  {
    name: 'git_log',
    description: 'Show recent commit log.',
    parameters: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of commits to show (default: 5)' },
      },
      required: [],
    },
    execute: gitLogHandler,
  },
  {
    name: 'git_push',
    description: 'Push commits to a remote repository.',
    parameters: {
      type: 'object',
      properties: {
        remote: { type: 'string', description: 'Remote name (default: origin)' },
        branch: { type: 'string', description: 'Branch name (default: main)' },
      },
      required: [],
    },
    execute: gitPushHandler,
  },
];
