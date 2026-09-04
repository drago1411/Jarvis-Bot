import { spawn, exec, ChildProcess } from 'child_process';
import { resolve, normalize, relative, isAbsolute } from 'path';
import { existsSync } from 'fs';
import { config } from '../config.js';
import type { ToolDefinition } from '../types.js';

interface ActiveService {
  name: string;
  project: string;
  command: string;
  port?: number;
  pid?: number;
  child: ChildProcess;
  startedAt: Date;
  logs: string[];
}

export const activeServices = new Map<string, ActiveService>();

function safePath(filePath: string): string | null {
  if (!filePath) return null;
  const rootResolved = resolve(normalize(config.workspaceRoot));
  const targetResolved = resolve(rootResolved, filePath);
  const rel = relative(rootResolved.toLowerCase(), targetResolved.toLowerCase());
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return null;
  }
  return targetResolved;
}

/**
 * Kill a process and its children cleanly on Windows
 */
function terminateProcess(pid: number): Promise<void> {
  return new Promise((resolvePromise) => {
    exec(`taskkill /PID ${pid} /T /F`, () => {
      resolvePromise();
    });
  });
}

// Cleanup on main server shutdown
process.on('exit', () => {
  for (const [, svc] of activeServices) {
    if (svc.pid) {
      try {
        process.kill(svc.pid, 'SIGKILL');
      } catch { /* ignore */ }
    }
  }
});

async function startServiceHandler(args: Record<string, unknown>): Promise<string> {
  const project = (args['project'] as string) || '.';
  const command = (args['command'] as string)?.trim();
  const name = ((args['name'] as string) || project).trim().toLowerCase();
  const specifiedPort = args['port'] ? parseInt(String(args['port']), 10) : undefined;

  if (!command) {
    return '❌ Error: "command" is required (e.g. "npm run dev", "npx serve", "python app.py").';
  }

  const resolvedDir = safePath(project);
  if (!resolvedDir || !existsSync(resolvedDir)) {
    return `❌ Error: Project directory "${project}" does not exist in workspace.`;
  }

  if (activeServices.has(name)) {
    const existing = activeServices.get(name)!;
    return `⚠️ Service "${name}" is already running (PID: ${existing.pid}, Port: ${existing.port || 'unknown'}). Stop it first using stop_service.`;
  }

  return new Promise<string>((resolvePromise) => {
    let resolved = false;
    const logs: string[] = [];
    let detectedPort: number | undefined = specifiedPort;

    const child = spawn(command, {
      cwd: resolvedDir,
      shell: 'powershell.exe',
      env: { ...process.env, PORT: specifiedPort ? String(specifiedPort) : undefined },
    });

    const finish = (msg: string) => {
      if (!resolved) {
        resolved = true;
        resolvePromise(msg);
      }
    };

    child.stdout?.on('data', (data) => {
      const line = data.toString();
      logs.push(line);
      if (logs.length > 50) logs.shift();

      if (!detectedPort) {
        const match = line.match(/(?:localhost|127\.0\.0\.1):(\d{2,5})/i) || line.match(/port\s+(\d{2,5})/i);
        if (match && match[1]) {
          detectedPort = parseInt(match[1], 10);
        }
      }
    });

    child.stderr?.on('data', (data) => {
      const line = data.toString();
      logs.push(line);
      if (logs.length > 50) logs.shift();
    });

    child.on('error', (err) => {
      activeServices.delete(name);
      finish(`❌ Failed to start service "${name}": ${err.message}`);
    });

    child.on('exit', (code) => {
      activeServices.delete(name);
      finish(`❌ Service "${name}" exited immediately with code ${code}.\nLogs:\n${logs.join('\n').slice(-500)}`);
    });

    // Wait 2.5 seconds to ensure server is stable and capture port
    setTimeout(() => {
      if (child.exitCode !== null) {
        finish(`❌ Service "${name}" exited before becoming ready.`);
        return;
      }

      activeServices.set(name, {
        name,
        project,
        command,
        port: detectedPort,
        pid: child.pid,
        child,
        startedAt: new Date(),
        logs,
      });

      const portMsg = detectedPort ? ` Port: ${detectedPort} | URL: http://localhost:${detectedPort}` : '';
      finish(`🚀 Service "${name}" is LIVE in the background (PID: ${child.pid}).${portMsg}\nCommand: \`${command}\`\nDirectory: \`${project}\``);
    }, 2500);
  });
}

async function stopServiceHandler(args: Record<string, unknown>): Promise<string> {
  const name = (args['name'] as string)?.trim().toLowerCase();

  if (!name) {
    return '❌ Error: "name" parameter is required.';
  }

  if (name === 'all') {
    const count = activeServices.size;
    for (const [svcName, svc] of activeServices) {
      if (svc.pid) await terminateProcess(svc.pid);
      else svc.child.kill();
      activeServices.delete(svcName);
    }
    return `🛑 Stopped all (${count}) running background services.`;
  }

  const svc = activeServices.get(name);
  if (!svc) {
    const available = Array.from(activeServices.keys()).join(', ') || 'none';
    return `❌ Service "${name}" not found. Running services: ${available}`;
  }

  if (svc.pid) {
    await terminateProcess(svc.pid);
  } else {
    svc.child.kill();
  }
  activeServices.delete(name);

  return `🛑 Service "${name}" stopped successfully.`;
}

async function listServicesHandler(): Promise<string> {
  if (activeServices.size === 0) {
    return 'ℹ️ No background dev servers or services are currently running.';
  }

  const lines: string[] = ['⚡ **Active Background Services:**\n'];
  for (const [, svc] of activeServices) {
    const uptimeSec = Math.floor((Date.now() - svc.startedAt.getTime()) / 1000);
    const portStr = svc.port ? `http://localhost:${svc.port}` : 'Port unknown';
    lines.push(`• **${svc.name}** (PID: ${svc.pid})`);
    lines.push(`  Command: \`${svc.command}\` in \`${svc.project}\``);
    lines.push(`  Status: Running (${uptimeSec}s) | ${portStr}\n`);
  }

  return lines.join('\n');
}

export const servicesTools: ToolDefinition[] = [
  {
    name: 'start_service',
    description: 'Start a long-running background development server or script (e.g. "npm run dev", "vite", "python -m http.server") without blocking the conversation.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to run (e.g. "npm run dev", "npx serve -p 5174")',
        },
        project: {
          type: 'string',
          description: 'Project folder relative to workspace (e.g. "my-app")',
        },
        name: {
          type: 'string',
          description: 'Unique identifier name for this service (e.g. "web-dev-server")',
        },
        port: {
          type: 'number',
          description: 'Optional anticipated port number (e.g. 5174, 3001)',
        },
      },
      required: ['command', 'project'],
    },
    execute: startServiceHandler,
  },
  {
    name: 'stop_service',
    description: 'Stop a running background dev server or process by name, or pass "all" to stop everything.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The service name to terminate, or "all"',
        },
      },
      required: ['name'],
    },
    execute: stopServiceHandler,
  },
  {
    name: 'list_services',
    description: 'List all currently running background dev servers, ports, and process IDs.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: listServicesHandler,
  },
];
