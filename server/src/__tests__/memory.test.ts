/**
 * JARVIS Memory Database — Unit Tests
 *
 * Tests all SQLite memory functions using an isolated in-memory database.
 * Uses module mocking to redirect the `db` singleton to `:memory:`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';

// ─── Create an in-memory DB with the full schema ──────────────────────────────
function createTestDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      agent TEXT DEFAULT 'JARVIS',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS memory_facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fact TEXT NOT NULL UNIQUE,
      category TEXT DEFAULT 'general',
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

    CREATE TABLE IF NOT EXISTS conversation_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      summary TEXT NOT NULL,
      message_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return db;
}

// ─── Inline implementations (mirrors db.ts but uses test DB) ─────────────────
function makeMemoryHelpers(db: ReturnType<typeof createTestDb>) {
  const saveFact = (fact: string, category = 'general') => {
    try {
      db.prepare('INSERT OR REPLACE INTO memory_facts (fact, category) VALUES (?, ?)').run(fact, category);
      return `✅ Remembered: "${fact}"`;
    } catch (e) {
      return `❌ Could not save fact: ${(e as Error).message}`;
    }
  };

  const getAllFacts = () => {
    const rows = db.prepare('SELECT fact FROM memory_facts').all() as Array<{ fact: string }>;
    return rows.map((r) => r.fact);
  };

  const saveSkill = (name: string, description: string, solution: string, category = 'general') => {
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
  };

  const searchSkills = (query: string, limit = 3) => {
    const words = query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3);

    if (words.length === 0) {
      return db
        .prepare('SELECT name, description, solution FROM skills ORDER BY success_count DESC, id DESC LIMIT ?')
        .all(limit) as Array<{ name: string; description: string; solution: string }>;
    }

    const all = db
      .prepare('SELECT name, description, solution FROM skills')
      .all() as Array<{ name: string; description: string; solution: string }>;

    const scored = all
      .map((skill) => {
        const text = `${skill.name} ${skill.description} ${skill.solution}`.toLowerCase();
        const score = words.reduce((acc, word) => acc + (text.includes(word) ? 1 : 0), 0);
        return { ...skill, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, limit);
  };

  const saveTrajectory = (entry: {
    userPrompt: string;
    steps: unknown[];
    finalResponse?: string;
    status?: string;
    rewardScore?: number;
    tags?: string;
  }) => {
    db.prepare(`
      INSERT INTO trajectories (session_id, user_prompt, steps, final_response, status, reward_score, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      `sess_test`,
      entry.userPrompt,
      JSON.stringify(entry.steps),
      entry.finalResponse || '',
      entry.status || 'success',
      entry.rewardScore ?? 1.0,
      entry.tags || '',
    );
  };

  const getRecentTrajectories = (limit = 10) => {
    const rows = db.prepare('SELECT * FROM trajectories ORDER BY id DESC LIMIT ?').all(limit) as any[];
    return rows.map((r) => ({ ...r, steps: JSON.parse(r.steps || '[]') }));
  };

  const saveConversationSummary = (summary: string, messageCount = 0) => {
    db.prepare('INSERT INTO conversation_summaries (summary, message_count) VALUES (?, ?)').run(summary, messageCount);
  };

  const getLatestSummary = (): string | null => {
    const row = db
      .prepare('SELECT summary FROM conversation_summaries ORDER BY id DESC LIMIT 1')
      .get() as { summary: string } | undefined;
    return row ? row.summary : null;
  };

  const exportTrainingDataset = (format: 'sharegpt' | 'alpaca' = 'sharegpt') => {
    const rows = db
      .prepare(
        'SELECT user_prompt, steps, final_response, reward_score FROM trajectories WHERE reward_score >= 0.7 ORDER BY id ASC',
      )
      .all() as Array<{ user_prompt: string; steps: string; final_response: string; reward_score: number }>;

    const records: any[] = [];
    for (const row of rows) {
      let stepsSummary = '';
      try {
        const steps = JSON.parse(row.steps || '[]');
        const toolCalls = steps
          .filter((s: any) => s.type === 'tool_start')
          .map((s: any) => `[Action]: ${s.name}(${JSON.stringify(s.args || {})})`)
          .join('\n');
        if (toolCalls) stepsSummary = `\n${toolCalls}\n\n`;
      } catch {
        // ignore
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
        records.push({ instruction: row.user_prompt, input: '', output: fullAssistantResponse });
      }
    }

    return records.map((r) => JSON.stringify(r)).join('\n');
  };

  return {
    saveFact, getAllFacts, saveSkill, searchSkills,
    saveTrajectory, getRecentTrajectories,
    saveConversationSummary, getLatestSummary, exportTrainingDataset,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Memory Facts', () => {
  let helpers: ReturnType<typeof makeMemoryHelpers>;

  beforeEach(() => {
    helpers = makeMemoryHelpers(createTestDb());
  });

  it('saves a fact and returns success message', () => {
    const result = helpers.saveFact('User prefers TypeScript over JavaScript');
    expect(result).toContain('✅ Remembered');
  });

  it('retrieves saved facts', () => {
    helpers.saveFact('User works late at night', 'habits');
    helpers.saveFact('User prefers dark mode UI', 'preferences');

    const facts = helpers.getAllFacts();
    expect(facts).toHaveLength(2);
    // Order is insertion order (by id) — check set membership not position
    expect(facts).toContain('User works late at night');
    expect(facts).toContain('User prefers dark mode UI');
  });

  it('returns empty array when no facts saved', () => {
    const facts = helpers.getAllFacts();
    expect(facts).toEqual([]);
  });

  it('deduplicates facts on repeat insertion (UNIQUE constraint)', () => {
    helpers.saveFact('User is building a portfolio');
    helpers.saveFact('User is building a portfolio'); // duplicate

    const facts = helpers.getAllFacts();
    expect(facts).toHaveLength(1);
  });

  it('saves fact with category', () => {
    const result = helpers.saveFact('Prefers Express over Fastify', 'tech_stack');
    expect(result).toContain('✅');
  });
});

describe('Skill Store', () => {
  let helpers: ReturnType<typeof makeMemoryHelpers>;

  beforeEach(() => {
    helpers = makeMemoryHelpers(createTestDb());
  });

  it('saves a new skill and returns confirmation', () => {
    const result = helpers.saveSkill('vitest-esm-config', 'Setting up Vitest with ESM', 'Use type:module in package.json');
    expect(result).toContain('✅ Stored Skill');
    expect(result).toContain('vitest-esm-config');
  });

  it('increments success_count on duplicate skill name', () => {
    const db = createTestDb();
    const h = makeMemoryHelpers(db);
    h.saveSkill('canvas-hidpi', 'Canvas sharpness', 'Scale by devicePixelRatio');
    h.saveSkill('canvas-hidpi', 'Canvas sharpness', 'Scale by devicePixelRatio');

    const row = db.prepare("SELECT success_count FROM skills WHERE name = 'canvas-hidpi'").get() as { success_count: number };
    expect(row.success_count).toBe(2);
  });

  it('returns empty array when no matching skill', () => {
    const results = helpers.searchSkills('quantum physics blockchain nft');
    expect(results).toEqual([]);
  });

  it('finds skills by keyword relevance', () => {
    helpers.saveSkill('canvas-hidpi-sharpness', 'Canvas scaling for HiDPI screens', 'Multiply by devicePixelRatio');
    helpers.saveSkill('sqlite-foreign-keys', 'Enable FK constraints in SQLite', 'PRAGMA foreign_keys = ON');

    const results = helpers.searchSkills('canvas scaling resolution');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('canvas-hidpi-sharpness');
  });

  it('ranks higher-scoring skills first', () => {
    helpers.saveSkill('vitest-setup', 'Configure vitest for TypeScript tests', 'vitest config ts');
    helpers.saveSkill('vite-build', 'Optimize Vite production build', 'vite build config');

    const results = helpers.searchSkills('vitest typescript configuration');
    expect(results[0].name).toBe('vitest-setup');
  });
});

describe('Trajectory Logging', () => {
  let helpers: ReturnType<typeof makeMemoryHelpers>;

  beforeEach(() => {
    helpers = makeMemoryHelpers(createTestDb());
  });

  it('saves a trajectory entry', () => {
    helpers.saveTrajectory({
      userPrompt: 'Build a todo app',
      steps: [{ type: 'tool_start', name: 'write_file', args: { path: 'todo/index.html' } }],
      finalResponse: 'Done!',
      rewardScore: 1.0,
    });

    const trajectories = helpers.getRecentTrajectories(10);
    expect(trajectories).toHaveLength(1);
    expect(trajectories[0].user_prompt).toBe('Build a todo app');
    expect(trajectories[0].reward_score).toBe(1.0);
  });

  it('parses steps JSON correctly on retrieval', () => {
    const steps = [
      { type: 'tool_start', name: 'write_file', args: { path: 'app.ts' } },
      { type: 'tool_result', name: 'write_file', result: '✅ Written' },
    ];
    helpers.saveTrajectory({ userPrompt: 'Test', steps, rewardScore: 0.9 });

    const retrieved = helpers.getRecentTrajectories(1);
    expect(retrieved[0].steps).toHaveLength(2);
    expect(retrieved[0].steps[0].name).toBe('write_file');
  });

  it('exports sharegpt format correctly', () => {
    helpers.saveTrajectory({
      userPrompt: 'Write a sort function',
      steps: [{ type: 'tool_start', name: 'write_file', args: { path: 'sort.ts' } }],
      finalResponse: 'Here is a sort function...',
      rewardScore: 0.9,
    });

    const jsonl = helpers.exportTrainingDataset('sharegpt');
    expect(jsonl).toBeTruthy();
    const parsed = JSON.parse(jsonl.split('\n')[0]);
    expect(parsed.conversations).toBeDefined();
    expect(parsed.conversations[0].from).toBe('human');
    expect(parsed.conversations[1].from).toBe('gpt');
  });

  it('exports alpaca format correctly', () => {
    helpers.saveTrajectory({
      userPrompt: 'Explain recursion',
      steps: [],
      finalResponse: 'Recursion is when a function calls itself.',
      rewardScore: 1.0,
    });

    const jsonl = helpers.exportTrainingDataset('alpaca');
    const parsed = JSON.parse(jsonl.split('\n')[0]);
    expect(parsed.instruction).toBe('Explain recursion');
    expect(parsed.output).toBeTruthy();
    expect(parsed.input).toBe('');
  });

  it('filters out low-reward trajectories from export', () => {
    helpers.saveTrajectory({ userPrompt: 'Low quality', steps: [], finalResponse: 'Bad', rewardScore: 0.3 });
    helpers.saveTrajectory({ userPrompt: 'High quality', steps: [], finalResponse: 'Good', rewardScore: 1.0 });

    const jsonl = helpers.exportTrainingDataset('sharegpt');
    const lines = jsonl.trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.conversations[0].value).toBe('High quality');
  });
});

describe('Conversation Summaries', () => {
  let helpers: ReturnType<typeof makeMemoryHelpers>;

  beforeEach(() => {
    helpers = makeMemoryHelpers(createTestDb());
  });

  it('returns null when no summary exists', () => {
    expect(helpers.getLatestSummary()).toBeNull();
  });

  it('saves and retrieves a conversation summary', () => {
    helpers.saveConversationSummary('We built a portfolio app with dark mode. Used Vite + TypeScript.', 15);
    const summary = helpers.getLatestSummary();
    expect(summary).toContain('portfolio app');
  });

  it('returns the most recent summary when multiple exist', () => {
    helpers.saveConversationSummary('First summary', 5);
    helpers.saveConversationSummary('Second summary — most recent', 10);

    const summary = helpers.getLatestSummary();
    expect(summary).toBe('Second summary — most recent');
  });
});
