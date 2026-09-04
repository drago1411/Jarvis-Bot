import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { resolve, extname } from 'path';
import { config } from '../config.js';
import type { ToolDefinition } from '../types.js';

interface Issue {
  file: string;
  line?: number;
  severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
  message: string;
}

function scanFiles(dir: string, fileList: string[] = []): string[] {
  if (!existsSync(dir)) return fileList;
  const items = readdirSync(dir);
  for (const item of items) {
    if (item === 'node_modules' || item === '.git' || item === 'dist' || item === 'build') continue;
    const full = resolve(dir, item);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      scanFiles(full, fileList);
    } else if (/\.(js|ts|jsx|tsx|html|css|json|py)$/i.test(item)) {
      fileList.push(full);
    }
  }
  return fileList;
}

async function reviewCodeHandler(args: Record<string, unknown>): Promise<string> {
  const projectDir = (args['project'] as string)?.trim() || '.';
  const fullRoot = resolve(config.workspaceRoot, projectDir);

  if (!existsSync(fullRoot)) {
    return `❌ Project directory not found: ${projectDir}`;
  }

  const files = scanFiles(fullRoot);
  if (files.length === 0) {
    return `ℹ️ No analyzable source files found in ${projectDir}`;
  }

  const issues: Issue[] = [];
  let totalLines = 0;

  for (const file of files) {
    const rel = file.replace(config.workspaceRoot, '').replace(/^[/\\]/, '');
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    totalLines += lines.length;

    // Static security / code smell checks
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;

      // 1. Hardcoded API keys / tokens
      if (/(api[_-]?key|secret|token|password)\s*[:=]\s*['"][A-Za-z0-9_\-]{8,}['"]/i.test(line)) {
        issues.push({
          file: rel,
          line: lineNum,
          severity: 'CRITICAL',
          message: 'Possible hardcoded secret or API credential detected.',
        });
      }

      // 2. Dangerous eval / innerHTML injection risks
      if (/\beval\s*\(/.test(line)) {
        issues.push({
          file: rel,
          line: lineNum,
          severity: 'CRITICAL',
          message: 'Direct use of eval() detected. Vulnerable to code injection.',
        });
      }

      // 3. console.log in production code
      if (/console\.(log|debug|warn)\(/.test(line) && !rel.includes('test') && !rel.includes('server')) {
        issues.push({
          file: rel,
          line: lineNum,
          severity: 'SUGGESTION',
          message: 'Debug logging statement found.',
        });
      }

      // 4. Any types in TypeScript
      if (extname(file) === '.ts' || extname(file) === '.tsx') {
        if (/:\s*any\b/.test(line)) {
          issues.push({
            file: rel,
            line: lineNum,
            severity: 'WARNING',
            message: 'Unsafe "any" type annotation used.',
          });
        }
      }
    });
  }

  const criticalCount = issues.filter(i => i.severity === 'CRITICAL').length;
  const warningCount = issues.filter(i => i.severity === 'WARNING').length;
  const suggestionCount = issues.filter(i => i.severity === 'SUGGESTION').length;

  let report = `🛡️ **Autonomous Code Review Report: \`${projectDir}\`**\n\n` +
    `- **Files Scanned**: ${files.length}\n` +
    `- **Total Lines**: ${totalLines.toLocaleString()}\n` +
    `- **Summary**: 🔴 ${criticalCount} Critical | 🟡 ${warningCount} Warnings | 🟢 ${suggestionCount} Suggestions\n\n`;

  if (issues.length === 0) {
    report += `🎉 **Clean Codebase!** No obvious vulnerabilities or anti-patterns detected.`;
  } else {
    report += `### Identified Findings:\n`;
    for (const issue of issues.slice(0, 15)) {
      const icon = issue.severity === 'CRITICAL' ? '🔴' : issue.severity === 'WARNING' ? '🟡' : '🟢';
      const linePart = issue.line ? `:${issue.line}` : '';
      report += `- ${icon} **[${issue.severity}]** \`${issue.file}${linePart}\`: ${issue.message}\n`;
    }
    if (issues.length > 15) {
      report += `\n*...and ${issues.length - 15} additional minor recommendations.*`;
    }
  }

  return report;
}

export const reviewerTools: ToolDefinition[] = [
  {
    name: 'review_code',
    description: 'Autonomous static security, vulnerability, and quality code auditor for any workspace project or directory.',
    parameters: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project folder name or path relative to workspace (e.g. "calculator", "express-api")',
        },
      },
      required: ['project'],
    },
    execute: reviewCodeHandler,
  },
];
