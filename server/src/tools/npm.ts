import { exec } from 'child_process';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { config } from '../config.js';
import type { ToolDefinition } from '../types.js';

/**
 * Run an npm command in a project directory.
 */
function runNpm(command: string, projectDir: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolvePromise) => {
    exec(`npm ${command}`, {
      cwd: projectDir,
      timeout: 60000,
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

async function npmInstallHandler(args: Record<string, unknown>): Promise<string> {
  const project = (args['project'] as string) || '.';
  const packages = (args['packages'] as string) || '';
  const dev = args['dev'] ? '-D ' : '';
  const dir = resolve(config.workspaceRoot, project);
  if (!existsSync(dir)) return `❌ Project directory not found: ${dir}`;

  const cmd = packages ? `install ${dev}${packages}` : 'install';
  const { stdout, stderr, code } = await runNpm(cmd, dir);
  if (code !== 0) return `❌ npm install failed: ${stderr.slice(0, 500)}`;
  return `✅ npm install complete:\n${stdout.slice(0, 500)}`;
}

async function npmRunHandler(args: Record<string, unknown>): Promise<string> {
  const project = (args['project'] as string) || '.';
  const script = (args['script'] as string) || 'build';
  const dir = resolve(config.workspaceRoot, project);
  if (!existsSync(dir)) return `❌ Project directory not found: ${dir}`;

  const { stdout, stderr, code } = await runNpm(`run ${script}`, dir);
  if (code !== 0) return `❌ npm run ${script} failed:\n${stderr.slice(0, 800)}`;
  return `✅ npm run ${script}:\n${stdout.slice(0, 800)}`;
}

async function npmListHandler(args: Record<string, unknown>): Promise<string> {
  const project = (args['project'] as string) || '.';
  const dir = resolve(config.workspaceRoot, project);
  if (!existsSync(dir)) return `❌ Project directory not found: ${dir}`;

  const { stdout, stderr, code } = await runNpm('ls --depth=0', dir);
  if (code !== 0 && !stdout) return `❌ npm ls error: ${stderr.slice(0, 500)}`;
  return stdout.slice(0, 1500) || 'No packages found.';
}

async function npmAuditHandler(args: Record<string, unknown>): Promise<string> {
  const project = (args['project'] as string) || '.';
  const dir = resolve(config.workspaceRoot, project);
  if (!existsSync(dir)) return `❌ Project directory not found: ${dir}`;

  const { stdout, stderr, code } = await runNpm('audit --json', dir);
  try {
    const result = JSON.parse(stdout);
    const vulns = result.metadata?.vulnerabilities || {};
    const summary = Object.entries(vulns)
      .filter(([, count]) => (count as number) > 0)
      .map(([severity, count]) => `${severity}: ${count}`)
      .join(', ');
    return summary ? `⚠️ Vulnerabilities found: ${summary}` : '✅ No vulnerabilities found.';
  } catch {
    return stdout.slice(0, 800) || stderr.slice(0, 500) || '✅ Audit complete.';
  }
}

export const npmTools: ToolDefinition[] = [
  {
    name: 'npm_install',
    description: 'Install npm packages in a project. Leave packages empty to install from package.json.',
    parameters: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project folder relative to workspace (e.g. "my-api")' },
        packages: { type: 'string', description: 'Space-separated package names (e.g. "express cors")' },
        dev: { type: 'boolean', description: 'Install as devDependency' },
      },
      required: ['project'],
    },
    execute: npmInstallHandler,
  },
  {
    name: 'npm_run',
    description: 'Run an npm script in a project (e.g. build, lint, start).',
    parameters: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project folder' },
        script: { type: 'string', description: 'Script name from package.json (e.g. "build", "lint")' },
      },
      required: ['project', 'script'],
    },
    execute: npmRunHandler,
  },
  {
    name: 'npm_list',
    description: 'List installed packages in a project.',
    parameters: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project folder' },
      },
      required: ['project'],
    },
    execute: npmListHandler,
  },
  {
    name: 'npm_audit',
    description: 'Run npm audit to check for security vulnerabilities.',
    parameters: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project folder' },
      },
      required: ['project'],
    },
    execute: npmAuditHandler,
  },
];
