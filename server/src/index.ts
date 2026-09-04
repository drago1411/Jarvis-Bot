import express from 'express';
import cors from 'cors';
import { resolve } from 'path';
import { config, validateConfig } from './config.js';
import { orchestrate } from './agents/orchestrator.js';
import {
  saveMessage,
  getRecentMessages,
  clearHistory,
  listTrackedProjects,
  trackProject,
  exportTrainingDataset,
  listSkills,
  getRecentTrajectories,
} from './memory/db.js';
import type { ChatMessage } from './types.js';

// Validate env vars on startup
validateConfig();

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// 1. Static project preview server: renders projects built in workbench/projects/
app.use('/projects', express.static(resolve(config.workspaceRoot)));

/**
 * Health check endpoint.
 */
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'online',
    model: config.model,
    workspace: config.workspaceRoot,
    timestamp: new Date().toISOString(),
  });
});

import os from 'os';
import { exec } from 'child_process';

/** Take a CPU tick snapshot across all cores */
function cpuSnapshot(): { idle: number; total: number } {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    for (const type in cpu.times) {
      total += (cpu.times as any)[type];
    }
    idle += cpu.times.idle;
  }
  return { idle, total };
}

/** Get free disk space on D: via PowerShell */
function getDiskFree(): Promise<{ freeGB: string; totalGB: string; usedPct: number }> {
  return new Promise((resolve) => {
    exec('powershell -Command "Get-Volume -DriveLetter D | Select-Object SizeRemaining, Size | ConvertTo-Json"', (err, stdout) => {
      if (err) { resolve({ freeGB: '—', totalGB: '—', usedPct: 0 }); return; }
      try {
        const data = JSON.parse(stdout.trim());
        const free = data.SizeRemaining;
        const total = data.Size;
        const used = total - free;
        resolve({
          freeGB: `${(free / (1024 ** 3)).toFixed(0)} GB free`,
          totalGB: `${(used / (1024 ** 3)).toFixed(0)} / ${(total / (1024 ** 3)).toFixed(0)} GB`,
          usedPct: Math.round((used / total) * 100),
        });
      } catch {
        resolve({ freeGB: '—', totalGB: '—', usedPct: 0 });
      }
    });
  });
}

/**
 * Live System Telemetry Endpoint (CPU, RAM, Disk, Uptime)
 * Uses two-sample delta method for accurate real-time CPU %.
 */
app.get('/api/system', async (_req, res) => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memUsagePct = Math.round((usedMem / totalMem) * 100);

  // Two-sample delta CPU measurement (100ms apart)
  const snap1 = cpuSnapshot();
  await new Promise((r) => setTimeout(r, 100));
  const snap2 = cpuSnapshot();
  const idleDelta = snap2.idle - snap1.idle;
  const totalDelta = snap2.total - snap1.total;
  const cpuUsagePct = totalDelta > 0
    ? Math.min(100, Math.max(0, Math.round((1 - idleDelta / totalDelta) * 100)))
    : 0;

  // Disk stats
  const disk = await getDiskFree();

  res.json({
    cpu: `${cpuUsagePct}%`,
    cpuPct: cpuUsagePct,
    ram: `${(usedMem / (1024 ** 3)).toFixed(1)} / ${(totalMem / (1024 ** 3)).toFixed(1)} GB`,
    ramPct: memUsagePct,
    disk: disk.totalGB,
    diskPct: disk.usedPct,
    uptime: `${Math.floor(os.uptime() / 3600)}h ${Math.floor((os.uptime() % 3600) / 60)}m`,
    platform: `${os.platform()} (${os.arch()})`,
  });
});

/**
 * In-memory pending command approvals queue
 */
export const pendingApprovals = new Map<string, (approved: boolean) => void>();

app.post('/api/approve', (req, res) => {
  const { approvalId, approved } = req.body as { approvalId: string; approved: boolean };
  const resolver = pendingApprovals.get(approvalId);
  if (resolver) {
    resolver(approved);
    pendingApprovals.delete(approvalId);
    res.json({ status: 'ok', approved });
  } else {
    res.status(404).json({ error: 'Approval request expired or not found' });
  }
});

import { readdirSync, existsSync } from 'fs';

/**
 * Get stored conversation history from SQLite.
 * Also auto-discovers any project directories in workbench/projects/ containing index.html.
 */
app.get('/api/history', (_req, res) => {
  try {
    const root = resolve(config.workspaceRoot);
    if (existsSync(root)) {
      const dirs = readdirSync(root, { withFileTypes: true });
      for (const dir of dirs) {
        if (dir.isDirectory() && existsSync(resolve(root, dir.name, 'index.html'))) {
          trackProject(dir.name, dir.name, 'Web Application', 'HTML/CSS/TS');
        }
      }
    }
  } catch (err) {
    console.warn('Project auto-discovery warning:', err);
  }

  const history = getRecentMessages(40);
  const projects = listTrackedProjects();
  res.json({ history, projects });
});

/**
 * Clear conversation history.
 */
app.post('/api/history/clear', (_req, res) => {
  clearHistory();
  res.json({ status: 'cleared' });
});

/**
 * Full Multi-Device Memory Sync Export
 */
app.get('/api/sync', (_req, res) => {
  import('./memory/db.js').then(({ exportFullDatabaseState }) => {
    res.json(exportFullDatabaseState());
  });
});

/**
 * Phase 1: Export Trajectory Fine-Tuning Dataset (ShareGPT or Alpaca JSONL)
 */
app.get('/api/training/export', (req, res) => {
  const format = (req.query['format'] === 'alpaca' ? 'alpaca' : 'sharegpt') as 'sharegpt' | 'alpaca';
  const dataset = exportTrainingDataset(format);
  res.setHeader('Content-Type', 'application/x-jsonlines');
  res.setHeader('Content-Disposition', `attachment; filename="jarvis_${format}_dataset.jsonl"`);
  res.send(dataset);
});

/**
 * Phase 1: View recent training trajectories
 */
app.get('/api/trajectories', (_req, res) => {
  res.json({ trajectories: getRecentTrajectories(50) });
});

/**
 * Phase 2: View learned skills and lessons
 */
app.get('/api/skills', (_req, res) => {
  res.json({ skills: listSkills() });
});

/**
 * Autonomous Webhook Receiver (GitHub CI / External Triggers)
 */
app.post('/api/webhook', (req, res) => {
  const event = req.headers['x-github-event'] || 'custom_trigger';
  const payload = req.body;
  console.log(`📡 Webhook received [${event}]:`, payload);
  res.json({ status: 'received', event, timestamp: new Date().toISOString() });
});

/**
 * Main chat endpoint — accepts a message and conversation history,
 * runs the orchestrator, and streams events back via SSE.
 */
app.post('/api/chat', async (req, res) => {
  const { message } = req.body as {
    message: string;
  };

  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'Missing "message" field' });
    return;
  }

  // Persist user message to SQLite
  saveMessage('user', message, 'Hareeshwar');

  // Load context from SQLite
  const dbHistory = getRecentMessages(20);

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const activeApprovalIds = new Set<string>();

  req.on('close', () => {
    for (const id of activeApprovalIds) {
      pendingApprovals.delete(id);
    }
    activeApprovalIds.clear();
  });

  // Request-scoped approval handler
  const requestApproval = (command: string, dir: string): Promise<boolean> => {
    const approvalId = `appr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    activeApprovalIds.add(approvalId);
    res.write(`event: command_approval\ndata: ${JSON.stringify({ approvalId, command, dir })}\n\n`);

    return new Promise<boolean>((resolveApproval) => {
      // Auto-deny if no response in 60 seconds
      const timer = setTimeout(() => {
        pendingApprovals.delete(approvalId);
        activeApprovalIds.delete(approvalId);
        resolveApproval(false);
      }, 60000);

      pendingApprovals.set(approvalId, (approved: boolean) => {
        clearTimeout(timer);
        activeApprovalIds.delete(approvalId);
        resolveApproval(approved);
      });
    });
  };

  // Live Task Plan emitter
  const emitTaskPlan = (plan: { tasks: any[]; progressPct: number }) => {
    res.write(`event: task_plan\ndata: ${JSON.stringify(plan)}\n\n`);
  };

  let fullAssistantResponse = '';

  try {
    // Run the orchestrator and stream events with request context
    for await (const event of orchestrate(message, dbHistory, { requestApproval, emitTaskPlan })) {
      if (event.type === 'text') {
        fullAssistantResponse += (event.data['content'] as string) || '';
      }
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
    }

    // Persist assistant message to SQLite
    if (fullAssistantResponse) {
      saveMessage('assistant', fullAssistantResponse, 'JARVIS');
    }
  } catch (err) {
    const error = err as Error;
    res.write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
    res.write(`event: done\ndata: {}\n\n`);
  }

  res.end();
});

/**
 * Start the server.
 */
app.listen(config.port, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║     J.A.R.V.I.S. Server — Online            ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Port:      ${String(config.port).padEnd(33)}║`);
  console.log(`║  Model:     ${config.model.padEnd(33)}║`);
  console.log(`║  Workspace: ${config.workspaceRoot.slice(0, 33).padEnd(33)}║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
});
