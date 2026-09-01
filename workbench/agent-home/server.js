const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 30001;
const OLLAMA = 'http://localhost:11434';
const MODEL = process.env.JARVIS_MODEL || 'qwen3:8b';

const ROOT = __dirname;

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

http
  .createServer((req, res) => {
    // Static files
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      return send(res, 200, fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), 'text/html');
    }
    if (req.method === 'GET' && req.url === '/app.css') {
      return send(res, 200, fs.readFileSync(path.join(ROOT, 'app.css'), 'utf8'), 'text/css');
    }
    if (req.method === 'GET' && req.url === '/app.js') {
      return send(res, 200, fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'), 'text/javascript');
    }

    // Health check -> dashboard widgets
    if (req.method === 'GET' && req.url === '/api/health') {
      return fetch(OLLAMA + '/api/version')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('ollama down'))))
        .then(() => send(res, 200, { ollama: true, model: MODEL }))
        .catch(() => send(res, 200, { ollama: false, model: MODEL }));
    }

    // Chat proxy -> Ollama
    if (req.method === 'POST' && req.url === '/api/chat') {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => {
        let body;
        try {
          body = JSON.parse(data);
        } catch {
          return send(res, 400, { error: 'bad json' });
        }
        const messages = (body.messages || []).map((m) => ({ role: m.role, content: m.content }));

        const payload = {
          model: MODEL,
          messages,
          stream: false,
          options: { temperature: 0.7 },
        };

        fetch(OLLAMA + '/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
          .then((r) => r.json())
          .then((data) =>
            send(res, 200, {
              reply: data.message && data.message.content ? data.message.content : '(no reply)',
            })
          )
          .catch((err) => send(res, 500, { error: String(err) }));
      });
      return;
    }

    send(res, 404, { error: 'not found' });
  })
  .listen(PORT, () => {
    console.log(`JARVIS agent-home running at http://localhost:${PORT}`);
    console.log(`Model: ${MODEL} | Ollama: ${OLLAMA}`);
  });
