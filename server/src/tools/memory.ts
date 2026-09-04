import type { ToolDefinition } from '../types.js';
import { saveFact, getAllFacts, trackProject, listTrackedProjects, saveSkill, searchSkills, listSkills } from '../memory/db.js';

export const memoryTools: ToolDefinition[] = [
  {
    name: 'remember_fact',
    description: 'Save an important user preference, personal detail, or instruction to persistent SQLite memory across sessions.',
    parameters: {
      type: 'object',
      properties: {
        fact: {
          type: 'string',
          description: 'The fact or preference to remember (e.g. "User prefers dark mode by default", "User is building a portfolio for design work")',
        },
        category: {
          type: 'string',
          description: 'Optional category (preferences, tech_stack, notes)',
        },
      },
      required: ['fact'],
    },
    execute: async (args) => {
      const fact = args['fact'] as string;
      const category = (args['category'] as string) || 'general';
      return saveFact(fact, category);
    },
  },
  {
    name: 'recall_memories',
    description: 'Recall all long-term facts, preferences, and details remembered about the user.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      const facts = getAllFacts();
      if (facts.length === 0) return 'No custom memories stored yet.';
      return `Persistent Memories:\n${facts.map((f, i) => `${i + 1}. ${f}`).join('\n')}`;
    },
  },
  {
    name: 'save_skill',
    description: 'Store a validated technical solution, reusable pattern, or debugging fix into the persistent Skill Store so you remember it in future tasks.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Short identifier for the skill (e.g. "canvas-hidpi-sharpness", "vitest-esm-config", "sqlite-foreign-keys")',
        },
        description: {
          type: 'string',
          description: 'The problem context, symptoms, or requirement where this skill applies',
        },
        solution: {
          type: 'string',
          description: 'The verified code pattern, fix, or step-by-step resolution that works',
        },
        category: {
          type: 'string',
          description: 'Category (e.g. "frontend", "testing", "backend", "security")',
        },
      },
      required: ['name', 'description', 'solution'],
    },
    execute: async (args) => {
      const name = args['name'] as string;
      const desc = args['description'] as string;
      const sol = args['solution'] as string;
      const cat = (args['category'] as string) || 'general';
      return saveSkill(name, desc, sol, cat);
    },
  },
  {
    name: 'search_skills',
    description: 'Search the persistent Skill Store for previously validated solutions, patterns, or fixes.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Keywords describing the problem or technology (e.g. "canvas scaling", "vitest configuration")',
        },
      },
      required: ['query'],
    },
    execute: async (args) => {
      const query = args['query'] as string;
      const skills = searchSkills(query, 3);
      if (skills.length === 0) return `No matching skills found in the skill repository for "${query}".`;
      return `Relevant Learned Skills:\n\n` + skills.map(s => `📌 **${s.name}**\nContext: ${s.description}\nSolution:\n\`\`\`\n${s.solution}\n\`\`\``).join('\n\n');
    },
  },
  {
    name: 'register_project',
    description: 'Register or update a newly created or existing project in the persistent project registry.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name (e.g. "portfolio-v1")' },
        path: { type: 'string', description: 'Relative folder path inside workbench/projects/' },
        description: { type: 'string', description: 'Short summary of what this project does' },
        tech_stack: { type: 'string', description: 'Stack used (e.g. "HTML/CSS/TS")' },
      },
      required: ['name', 'path'],
    },
    execute: async (args) => {
      return trackProject(
        args['name'] as string,
        args['path'] as string,
        (args['description'] as string) || '',
        (args['tech_stack'] as string) || 'Vite + TypeScript'
      );
    },
  },
  {
    name: 'list_projects',
    description: 'List all previously built projects recorded in JARVIS memory.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      const projects = listTrackedProjects();
      if (projects.length === 0) return 'No projects recorded in database yet.';
      return `Tracked Projects in JARVIS Database:\n\n` +
        projects.map(p => `📁 **${p.name}** [${p.status}]\n   Path: ${p.path}\n   Stack: ${p.tech_stack}\n   Summary: ${p.description}`).join('\n\n');
    },
  },
];
