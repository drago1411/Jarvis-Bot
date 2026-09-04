import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { config } from '../config.js';
import type { ToolDefinition } from '../types.js';
import { trackProject } from '../memory/db.js';

interface TemplateFile {
  relativePath: string;
  content: string;
}

const TEMPLATES: Record<string, { description: string; techStack: string; files: TemplateFile[] }> = {
  'static-site': {
    description: 'Modern Dark-Mode Landing Page with Hero & Features',
    techStack: 'HTML5, CSS3, JavaScript',
    files: [
      {
        relativePath: 'index.html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nexus — Next-Gen Experience</title>
  <link rel="stylesheet" href="style.css">
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
</head>
<body>
  <div class="bg-glow"></div>
  <header class="navbar">
    <div class="logo">⚡ NEXUS</div>
    <nav>
      <a href="#features">Features</a>
      <a href="#about">About</a>
      <a href="#contact" class="btn-primary">Get Started</a>
    </nav>
  </header>

  <main>
    <section class="hero">
      <div class="badge">🚀 NEW GENERATION ARCHITECTURE</div>
      <h1>Build the Future with <span class="gradient-text">Pure Intelligence</span></h1>
      <p class="subtitle">Experience frictionless performance and ultra-responsive interfaces engineered for modern creators.</p>
      <div class="hero-actions">
        <button class="btn-primary glow-btn" id="explore-btn">Launch Workshop</button>
        <button class="btn-secondary">View Documentation</button>
      </div>
    </section>

    <section id="features" class="features">
      <h2>Engineered for Power</h2>
      <div class="grid">
        <div class="card">
          <div class="card-icon">⚡</div>
          <h3>Zero-Latency Core</h3>
          <p>Instantaneous execution cycles designed to keep your workflow uninterrupted.</p>
        </div>
        <div class="card">
          <div class="card-icon">🛡️</div>
          <h3>Autonomous Protection</h3>
          <p>Real-time security auditing and automated healing loops for your code.</p>
        </div>
        <div class="card">
          <div class="card-icon">🔮</div>
          <h3>Predictive Memory</h3>
          <p>Persistent context storage that recalls every detail of your technical evolution.</p>
        </div>
      </div>
    </section>
  </main>

  <footer>
    <p>© 2026 Nexus Labs. Crafted with JARVIS Autonomous Architecture.</p>
  </footer>

  <script src="app.js"></script>
</body>
</html>`,
      },
      {
        relativePath: 'style.css',
        content: `:root {
  --bg: #090d16;
  --surface: rgba(18, 26, 43, 0.7);
  --border: rgba(0, 212, 255, 0.15);
  --primary: #00d4ff;
  --primary-glow: rgba(0, 212, 255, 0.4);
  --text: #f0f6fc;
  --text-muted: #8b949e;
  --accent: #ffd700;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background-color: var(--bg);
  color: var(--text);
  font-family: 'Inter', sans-serif;
  min-height: 100vh;
  overflow-x: hidden;
}

.bg-glow {
  position: fixed;
  top: -20%;
  left: 50%;
  transform: translateX(-50%);
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, var(--primary-glow) 0%, rgba(9,13,22,0) 70%);
  z-index: -1;
  pointer-events: none;
}

.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem 3rem;
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 10;
}

.logo {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700;
  font-size: 1.4rem;
  letter-spacing: 2px;
  color: var(--primary);
}

nav a {
  color: var(--text-muted);
  text-decoration: none;
  margin-left: 2rem;
  font-weight: 500;
  transition: color 0.2s ease;
}

nav a:hover { color: var(--primary); }

.hero {
  text-align: center;
  padding: 6rem 2rem 4rem;
  max-width: 900px;
  margin: 0 auto;
}

.badge {
  display: inline-block;
  padding: 0.4rem 1rem;
  background: rgba(0, 212, 255, 0.1);
  border: 1px solid var(--border);
  border-radius: 50px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--primary);
  margin-bottom: 1.5rem;
  letter-spacing: 1px;
}

h1 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 3.5rem;
  line-height: 1.15;
  margin-bottom: 1.5rem;
}

.gradient-text {
  background: linear-gradient(135deg, #00d4ff, #8a2be2);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.subtitle {
  font-size: 1.2rem;
  color: var(--text-muted);
  margin-bottom: 2.5rem;
  line-height: 1.6;
}

.hero-actions {
  display: flex;
  justify-content: center;
  gap: 1rem;
}

.btn-primary {
  background: var(--primary);
  color: #000;
  font-weight: 600;
  padding: 0.8rem 1.8rem;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  box-shadow: 0 0 20px var(--primary-glow);
  transition: transform 0.2s, box-shadow 0.2s;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 30px var(--primary);
}

.btn-secondary {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--border);
  font-weight: 600;
  padding: 0.8rem 1.8rem;
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.btn-secondary:hover { border-color: var(--primary); }

.features {
  max-width: 1100px;
  margin: 4rem auto;
  padding: 0 2rem;
  text-align: center;
}

.features h2 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 2.2rem;
  margin-bottom: 3rem;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 2rem;
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 2.5rem 1.5rem;
  text-align: left;
  backdrop-filter: blur(8px);
  transition: transform 0.2s, border-color 0.2s;
}

.card:hover {
  transform: translateY(-5px);
  border-color: var(--primary);
}

.card-icon {
  font-size: 2rem;
  margin-bottom: 1rem;
}

.card h3 {
  font-family: 'Space Grotesk', sans-serif;
  margin-bottom: 0.75rem;
  font-size: 1.2rem;
}

.card p {
  color: var(--text-muted);
  font-size: 0.95rem;
  line-height: 1.5;
}

footer {
  text-align: center;
  padding: 3rem;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 0.85rem;
  margin-top: 5rem;
}`,
      },
      {
        relativePath: 'app.js',
        content: `document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('explore-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      alert('Welcome to Nexus! Built instantly via JARVIS Project Scaffolder.');
    });
  }
});`,
      },
    ],
  },
  'express-api': {
    description: 'Lightweight Express + TypeScript Backend API',
    techStack: 'Express, Node.js, TypeScript',
    files: [
      {
        relativePath: 'package.json',
        content: `{
  "name": "express-api-service",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "dev": "tsx watch src/index.ts"
  },
  "dependencies": {
    "express": "^4.21.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.5.0"
  }
}`,
      },
      {
        relativePath: 'src/index.ts',
        content: `import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date() });
});

app.get('/api/items', (req, res) => {
  res.json([
    { id: 1, title: 'Autonomous Agent Loop', active: true },
    { id: 2, title: 'Neural Telemetry Module', active: true },
    { id: 3, title: 'Persistent Vector Store', active: false }
  ]);
});

app.listen(PORT, () => {
  console.log(\`⚡ Express API listening on http://localhost:\${PORT}\`);
});`,
      },
    ],
  },
};

/**
 * TOOL: scaffold_template
 * Instant multi-file project scaffolder.
 */
async function scaffoldTemplateHandler(args: Record<string, unknown>): Promise<string> {
  const templateName = (args['template'] as string)?.toLowerCase().trim();
  const projectName = (args['name'] as string)?.trim();

  if (!projectName) {
    return '❌ Error: "name" parameter is required.';
  }

  const template = TEMPLATES[templateName];
  if (!template) {
    const available = Object.keys(TEMPLATES).join(', ');
    return `❌ Unknown template "${templateName}". Available templates: ${available}`;
  }

  const targetDir = resolve(config.workspaceRoot, projectName);
  const createdFiles: string[] = [];

  for (const file of template.files) {
    const fullPath = resolve(targetDir, file.relativePath);
    const dir = dirname(fullPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(fullPath, file.content, 'utf-8');
    createdFiles.push(file.relativePath);
  }

  // Register in SQLite projects memory
  trackProject(projectName, targetDir, template.description, template.techStack);

  return `✅ Successfully scaffolded "${templateName}" project into "${projectName}" (${createdFiles.length} files created):\n` +
    createdFiles.map(f => `  - ${f}`).join('\n') +
    `\n\nPreview live at: http://localhost:3000/projects/${projectName}/index.html`;
}

export const templatesTools: ToolDefinition[] = [
  {
    name: 'scaffold_template',
    description: 'Instant multi-file starter template scaffolder. Generates clean project boilerplates (templates: "static-site", "express-api"). Automatically registers project in memory.',
    parameters: {
      type: 'object',
      properties: {
        template: {
          type: 'string',
          description: 'The template name to use: "static-site", "express-api"',
        },
        name: {
          type: 'string',
          description: 'Project folder name (e.g. "portfolio", "nexus-dashboard", "auth-api")',
        },
      },
      required: ['template', 'name'],
    },
    execute: scaffoldTemplateHandler,
  },
];
