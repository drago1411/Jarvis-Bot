import express from 'express';
import cors from 'cors';
import { config, validateConfig } from './config.js';
import { orchestrate } from './agents/orchestrator.js';
import type { ChatMessage } from './types.js';

// Validate env vars on startup
validateConfig();

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

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

/**
 * Main chat endpoint — accepts a message and conversation history,
 * runs the orchestrator, and streams events back via SSE.
 */
app.post('/api/chat', async (req, res) => {
  const { message, history } = req.body as {
    message: string;
    history: ChatMessage[];
  };

  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'Missing "message" field' });
    return;
  }

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  try {
    // Run the orchestrator and stream events
    for await (const event of orchestrate(message, history || [])) {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
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
