/**
 * JARVIS Reflective Learning Engine
 *
 * Automatically runs after every 5 saved trajectories.
 * - Finds high-reward repeated tool patterns → auto-promotes to Skill Store
 * - Identifies repeated failure tools → logs warning patterns
 * - Closes the continuous learning flywheel loop
 */

import { db } from './db.js';
import { saveSkill } from './db.js';

interface TrajectoryRow {
  id: number;
  user_prompt: string;
  steps: string;
  final_response: string;
  status: string;
  reward_score: number;
  tags: string;
}

interface StepEntry {
  type: string;
  name?: string;
  args?: Record<string, unknown>;
  result?: string;
}

// How many trajectories to analyze per reflection pass
const REFLECTION_WINDOW = 10;
// Minimum times a tool pattern must appear to be promoted
const PROMOTION_THRESHOLD = 3;
// Minimum reward score to consider for promotion
const HIGH_REWARD_THRESHOLD = 0.85;
// Max reward score to flag as a failure pattern
const FAILURE_THRESHOLD = 0.45;

let trajectoryCountSinceLastReflection = 0;

/**
 * Increment the counter and trigger reflection every 5 trajectories.
 * This is called asynchronously (fire-and-forget) from the orchestrator.
 */
export async function maybeReflect(): Promise<void> {
  trajectoryCountSinceLastReflection++;
  if (trajectoryCountSinceLastReflection < 5) return;
  trajectoryCountSinceLastReflection = 0;

  try {
    await reflectOnTrajectories();
  } catch (err) {
    console.warn('[Reflector] Reflection pass failed silently:', (err as Error).message);
  }
}

/**
 * Core reflection logic:
 * 1. Load recent trajectories
 * 2. Cluster by tool-sequence patterns
 * 3. Promote high-reward clusters to skills
 * 4. Log failure patterns
 */
export async function reflectOnTrajectories(): Promise<string> {
  const rows = db
    .prepare(
      `SELECT id, user_prompt, steps, final_response, status, reward_score, tags
       FROM trajectories
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(REFLECTION_WINDOW) as TrajectoryRow[];

  if (rows.length === 0) return '[Reflector] No trajectories to analyze.';

  const highReward = rows.filter((r) => r.reward_score >= HIGH_REWARD_THRESHOLD);
  const failures = rows.filter((r) => r.reward_score <= FAILURE_THRESHOLD);

  const promotedSkills: string[] = [];
  const failureWarnings: string[] = [];

  // ─── Pattern Detection: High-Reward Tool Sequences ───────────────────────
  const toolPatternCount: Record<string, { count: number; examples: string[]; results: string[] }> = {};

  for (const row of highReward) {
    let steps: StepEntry[] = [];
    try {
      steps = JSON.parse(row.steps || '[]');
    } catch {
      continue;
    }

    const toolNames = steps
      .filter((s) => s.type === 'tool_start' && s.name)
      .map((s) => s.name as string);

    if (toolNames.length === 0) continue;

    // Key: normalized tool sequence (up to 3 tools)
    const pattern = toolNames.slice(0, 3).join(' → ');
    if (!toolPatternCount[pattern]) {
      toolPatternCount[pattern] = { count: 0, examples: [], results: [] };
    }
    toolPatternCount[pattern].count++;
    toolPatternCount[pattern].examples.push(row.user_prompt.slice(0, 80));
    if (row.final_response) {
      toolPatternCount[pattern].results.push(row.final_response.slice(0, 200));
    }
  }

  // Promote patterns that appear >= PROMOTION_THRESHOLD times
  for (const [pattern, data] of Object.entries(toolPatternCount)) {
    if (data.count < PROMOTION_THRESHOLD) continue;

    const skillName = `auto:${pattern.replace(/ → /g, '-').replace(/[^a-z0-9-_]/gi, '_').toLowerCase()}`;
    const description = `Auto-promoted: Tool sequence "${pattern}" succeeded ${data.count} times.\nExample tasks: ${data.examples.slice(0, 2).join('; ')}`;
    const solution = `Use this tool sequence for similar tasks:\n${pattern}\n\nExample outcome:\n${data.results[0] || 'Success'}`;

    const result = saveSkill(skillName, description, solution, 'auto-learned');
    promotedSkills.push(`${skillName} (${data.count}x)`);
    console.log(`[Reflector] ✅ Promoted skill: ${result}`);
  }

  // ─── Failure Pattern Detection ────────────────────────────────────────────
  for (const row of failures) {
    let steps: StepEntry[] = [];
    try {
      steps = JSON.parse(row.steps || '[]');
    } catch {
      continue;
    }

    const failedTools = steps
      .filter((s) => s.type === 'tool_result' && s.result?.startsWith('❌'))
      .map((s) => s.name || 'unknown');

    if (failedTools.length > 0) {
      const msg = `Prompt: "${row.user_prompt.slice(0, 60)}" failed at tools: [${failedTools.join(', ')}]`;
      failureWarnings.push(msg);
      console.warn(`[Reflector] ⚠️ Failure pattern: ${msg}`);
    }
  }

  const summary = [
    `[Reflector] Pass complete. Analyzed ${rows.length} trajectories.`,
    promotedSkills.length > 0
      ? `  ✅ Auto-promoted ${promotedSkills.length} skill(s): ${promotedSkills.join(', ')}`
      : '  ℹ️ No new patterns reached promotion threshold.',
    failureWarnings.length > 0
      ? `  ⚠️ ${failureWarnings.length} failure pattern(s) detected.`
      : '  ✅ No critical failure patterns.',
  ].join('\n');

  console.log(summary);
  return summary;
}
