import Database from 'better-sqlite3';
import { resolve } from 'path';

const DB_PATH = resolve(import.meta.dirname, '../../../jarvis.db');
export const db: InstanceType<typeof Database> = new Database(DB_PATH);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    agent TEXT DEFAULT 'JARVIS',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    path TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'in_progress',
    tech_stack TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS memory_facts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fact TEXT NOT NULL UNIQUE,
    category TEXT DEFAULT 'general',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS trajectories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    user_prompt TEXT NOT NULL,
    steps TEXT NOT NULL,
    final_response TEXT,
    status TEXT DEFAULT 'success',
    reward_score REAL DEFAULT 1.0,
    tags TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    category TEXT DEFAULT 'general',
    description TEXT NOT NULL,
    solution TEXT NOT NULL,
    success_count INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS conversation_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    summary TEXT NOT NULL,
    message_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed default profile if not present
const seedUser = db.prepare('SELECT value FROM preferences WHERE key = ?').get('user_name');
if (!seedUser) {
  const insertPref = db.prepare('INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)');
  insertPref.run('user_name', 'Hareeshwar');
  insertPref.run('preferred_stack', 'Vite + TypeScript + Vanilla CSS');
  insertPref.run('workspace_root', 'D:\\Jarvis\\workbench\\projects');
  insertPref.run('language', 'TypeScript');
}

/**
 * Message storage helpers
 */
export function saveMessage(role: 'user' | 'assistant', content: string, agent: string = 'JARVIS'): void {
  db.prepare('INSERT INTO messages (role, content, agent) VALUES (?, ?, ?)').run(role, content, agent);
}

export function getRecentMessages(limit: number = 30): Array<{ role: 'user' | 'assistant'; content: string; agent?: string }> {
  const rows = db.prepare('SELECT role, content, agent FROM messages ORDER BY id DESC LIMIT ?').all(limit) as Array<{ role: 'user' | 'assistant'; content: string; agent?: string }>;
  return rows.reverse();
}

export function clearHistory(): void {
  db.exec('DELETE FROM messages');
}

/**
 * Memory facts helpers
 */
export function saveFact(fact: string, category: string = 'general'): string {
  try {
    db.prepare('INSERT OR REPLACE INTO memory_facts (fact, category) VALUES (?, ?)').run(fact, category);
    return `✅ Remembered: "${fact}"`;
  } catch (e) {
    return `❌ Could not save fact: ${(e as Error).message}`;
  }
}

export function getAllFacts(): string[] {
  const rows = db.prepare('SELECT fact FROM memory_facts').all() as Array<{ fact: string }>;
  return rows.map(r => r.fact);
}

/**
 * Trajectory Logger Helpers (Phase 1 Continuous Learning)
 */
export interface TrajectoryEntry {
  sessionId?: string;
  userPrompt: string;
  steps: Array<{
    type: string;
    name?: string;
    args?: Record<string, unknown>;
    result?: string;
    content?: string;
    timestamp?: string;
  }>;
  finalResponse?: string;
  status?: 'success' | 'failed' | 'partial';
  rewardScore?: number;
  tags?: string;
}

export function saveTrajectory(entry: TrajectoryEntry): void {
  try {
    db.prepare(`
      INSERT INTO trajectories (session_id, user_prompt, steps, final_response, status, reward_score, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.sessionId || `sess_${Date.now()}`,
      entry.userPrompt,
      JSON.stringify(entry.steps),
      entry.finalResponse || '',
      entry.status || 'success',
      entry.rewardScore ?? 1.0,
      entry.tags || 'agent,react',
    );
  } catch (err) {
    console.warn('Could not persist trajectory:', err);
  }
}

export function getRecentTrajectories(limit: number = 50): any[] {
  const rows = db.prepare('SELECT * FROM trajectories ORDER BY id DESC LIMIT ?').all(limit) as any[];
  return rows.map(r => ({
    ...r,
    steps: JSON.parse(r.steps || '[]'),
  }));
}

/**
 * Export Trajectories as SFT Datasets (ShareGPT or Alpaca format)
 */
export function exportTrainingDataset(format: 'sharegpt' | 'alpaca' = 'sharegpt'): string {
  const rows = db.prepare('SELECT user_prompt, steps, final_response, reward_score FROM trajectories WHERE reward_score >= 0.7 ORDER BY id ASC').all() as Array<{
    user_prompt: string;
    steps: string;
    final_response: string;
    reward_score: number;
  }>;

  const records: any[] = [];

  for (const row of rows) {
    let stepsSummary = '';
    try {
      const steps = JSON.parse(row.steps || '[]');
      const toolCalls = steps
        .filter((s: any) => s.type === 'tool_start')
        .map((s: any) => `[Action]: ${s.name}(${JSON.stringify(s.args || {})})`)
        .join('\n');
      if (toolCalls) {
        stepsSummary = `\n${toolCalls}\n\n`;
      }
    } catch {
      // ignore json parse errors
    }

    const fullAssistantResponse = `${stepsSummary}${row.final_response || ''}`.trim();
    if (!fullAssistantResponse) continue;

    if (format === 'sharegpt') {
      records.push({
        conversations: [
          { from: 'human', value: row.user_prompt },
          { from: 'gpt', value: fullAssistantResponse },
        ],
      });
    } else {
      records.push({
        instruction: row.user_prompt,
        input: '',
        output: fullAssistantResponse,
      });
    }
  }

  return records.map(r => JSON.stringify(r)).join('\n');
}

/**
 * Reflective Skill Store (Phase 2 Experience Retrieval)
 */
export function saveSkill(name: string, description: string, solution: string, category = 'general'): string {
  try {
    db.prepare(`
      INSERT INTO skills (name, category, description, solution, success_count, updated_at)
      VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(name) DO UPDATE SET
        description = excluded.description,
        solution = excluded.solution,
        success_count = skills.success_count + 1,
        updated_at = CURRENT_TIMESTAMP
    `).run(name, category, description, solution);
    return `✅ Stored Skill: "${name}" (${category})`;
  } catch (err) {
    return `❌ Failed to save skill: ${(err as Error).message}`;
  }
}

export function searchSkills(query: string, limit = 3): Array<{ name: string; description: string; solution: string }> {
  const words = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3);
  if (words.length === 0) {
    return db.prepare('SELECT name, description, solution FROM skills ORDER BY success_count DESC, id DESC LIMIT ?').all(limit) as any[];
  }

  // Rank matches by keyword occurrences
  const all = db.prepare('SELECT name, description, solution FROM skills').all() as Array<{ name: string; description: string; solution: string }>;
  const scored = all.map(skill => {
    const text = `${skill.name} ${skill.description} ${skill.solution}`.toLowerCase();
    const score = words.reduce((acc, word) => acc + (text.includes(word) ? 1 : 0), 0);
    return { ...skill, score };
  }).filter(s => s.score > 0).sort((a, b) => b.score - a.score);

  return scored.slice(0, limit);
}

export function listSkills(): Array<{ name: string; category: string; description: string; solution: string; success_count: number }> {
  return db.prepare('SELECT name, category, description, solution, success_count FROM skills ORDER BY success_count DESC, updated_at DESC').all() as any[];
}

/**
 * Project registry helpers
 */
export function trackProject(name: string, path: string, description: string, techStack: string): string {
  try {
    db.prepare(`
      INSERT INTO projects (name, path, description, tech_stack, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(name) DO UPDATE SET
        path=excluded.path,
        description=excluded.description,
        tech_stack=excluded.tech_stack,
        updated_at=CURRENT_TIMESTAMP
    `).run(name, path, description, techStack);
    return `✅ Registered project: "${name}" at ${path}`;
  } catch (e) {
    return `❌ Failed to track project: ${(e as Error).message}`;
  }
}

export function listTrackedProjects(): Array<{ name: string; path: string; description: string; status: string; tech_stack: string }> {
  return db.prepare('SELECT name, path, description, status, tech_stack FROM projects ORDER BY updated_at DESC').all() as any[];
}

export function getPreferences(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM preferences').all() as Array<{ key: string; value: string }>;
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

/**
 * Conversation Summary helpers — used for anti-amnesia context compression
 */
export function saveConversationSummary(summary: string, messageCount: number = 0): void {
  db.prepare('INSERT INTO conversation_summaries (summary, message_count) VALUES (?, ?)').run(summary, messageCount);
}

export function getLatestSummary(): string | null {
  const row = db
    .prepare('SELECT summary FROM conversation_summaries ORDER BY id DESC LIMIT 1')
    .get() as { summary: string } | undefined;
  return row ? row.summary : null;
}

/**
 * getContextualMemory — Builds the full memory injection block for the system prompt.
 * Combines: all user facts, top matched skills, latest conversation summary, and recent projects.
 * Called on every request so JARVIS always has full context without needing to ask.
 */
export function getContextualMemory(query: string): string {
  const parts: string[] = [];

  // 1. User facts (always injected — these are explicit user preferences/instructions)
  const facts = getAllFacts();
  if (facts.length > 0) {
    parts.push(`## 🧠 Persistent User Facts & Preferences\n${facts.map((f, i) => `${i + 1}. ${f}`).join('\n')}`);
  }

  // 2. Relevant skills from the skill store (keyword search)
  const words = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3);
  let relevantSkills: Array<{ name: string; description: string; solution: string }> = [];
  if (words.length > 0) {
    const all = db
      .prepare('SELECT name, description, solution FROM skills ORDER BY success_count DESC')
      .all() as Array<{ name: string; description: string; solution: string }>;

    const scored = all
      .map((skill) => {
        const text = `${skill.name} ${skill.description} ${skill.solution}`.toLowerCase();
        const score = words.reduce((acc, word) => acc + (text.includes(word) ? 1 : 0), 0);
        return { ...skill, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    relevantSkills = scored;
  }

  if (relevantSkills.length > 0) {
    const skillText = relevantSkills
      .map((s) => `### Pattern: ${s.name}\n**Context**: ${s.description}\n**Solution**: ${s.solution}`)
      .join('\n\n');
    parts.push(`## 📌 Relevant Learned Skills\n${skillText}`);
  }

  // 3. Latest conversation summary (anti-amnesia)
  const summary = getLatestSummary();
  if (summary) {
    parts.push(`## 📋 Previous Context Summary\n${summary}`);
  }

  // 4. Recent projects
  const projects = db
    .prepare(
      'SELECT name, path, description, tech_stack FROM projects ORDER BY updated_at DESC LIMIT 5',
    )
    .all() as Array<{ name: string; path: string; description: string; tech_stack: string }>;

  if (projects.length > 0) {
    const projText = projects
      .map((p) => `• **${p.name}** (${p.tech_stack}) — ${p.description || 'No description'} → \`${p.path}\``)
      .join('\n');
    parts.push(`## 📁 Known Projects\n${projText}`);
  }

  if (parts.length === 0) return '';

  return `\n\n---\n## JARVIS Long-Term Memory Context\n${parts.join('\n\n')}\n---`;
}

export function exportFullDatabaseState(): {
  preferences: Record<string, string>;
  facts: string[];
  skills: any[];
  projects: any[];
  recentMessages: any[];
  exportedAt: string;
} {
  return {
    preferences: getPreferences(),
    facts: getAllFacts(),
    skills: listSkills(),
    projects: listTrackedProjects(),
    recentMessages: getRecentMessages(100),
    exportedAt: new Date().toISOString(),
  };
}

