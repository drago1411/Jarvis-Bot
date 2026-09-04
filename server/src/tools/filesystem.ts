import { readFile, writeFile, readdir, mkdir, unlink, stat } from 'fs/promises';
import { resolve, dirname, relative, isAbsolute, normalize } from 'path';
import { existsSync } from 'fs';
import { config } from '../config.js';
import type { ToolDefinition } from '../types.js';

/**
 * Resolves a path relative to the workspace root.
 * If an absolute path is given, it must be within the workspace.
 * Returns null if the path is outside the allowed workspace.
 */
function safePath(filePath: string): string | null {
  if (!filePath || typeof filePath !== 'string') return null;

  const rootResolved = resolve(normalize(config.workspaceRoot));
  const targetResolved = resolve(rootResolved, filePath);

  const rel = relative(rootResolved.toLowerCase(), targetResolved.toLowerCase());
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return null;
  }
  return targetResolved;
}

/**
 * TOOL: write_file
 * Creates or overwrites a file. Creates parent directories automatically.
 * If file exists, generates a compact diff of changes.
 */
async function writeFileHandler(args: Record<string, unknown>): Promise<string> {
  const filePath = args['path'] as string;
  const content = args['content'] as string;

  const resolved = safePath(filePath);
  if (!resolved) {
    return `❌ Error: Path "${filePath}" is outside the workspace. Files must be inside ${config.workspaceRoot}`;
  }

  try {
    // Capture old content for diff (if file exists)
    let diffSummary = '';
    if (existsSync(resolved)) {
      try {
        const old = await readFile(resolved, 'utf-8');
        const oldLines = old.split('\n');
        const newLines = content.split('\n');
        const added = newLines.filter(l => !oldLines.includes(l)).length;
        const removed = oldLines.filter(l => !newLines.includes(l)).length;
        diffSummary = ` | Δ +${added} -${removed} lines`;
      } catch { /* ignore read errors for new files */ }
    }

    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(resolved, content, 'utf-8');
    return `✅ Written: ${resolved} (${Buffer.byteLength(content, 'utf-8')} bytes)${diffSummary}`;
  } catch (err) {
    return `❌ Failed to write ${resolved}: ${(err as Error).message}`;
  }
}

/**
 * TOOL: read_file
 * Reads a file and returns its contents.
 */
async function readFileHandler(args: Record<string, unknown>): Promise<string> {
  const filePath = args['path'] as string;

  const resolved = safePath(filePath);
  if (!resolved) {
    return `❌ Error: Path "${filePath}" is outside the workspace.`;
  }

  try {
    const content = await readFile(resolved, 'utf-8');
    return content;
  } catch (err) {
    return `❌ Failed to read ${resolved}: ${(err as Error).message}`;
  }
}

/**
 * TOOL: list_directory
 * Lists files and folders in a directory.
 */
async function listDirHandler(args: Record<string, unknown>): Promise<string> {
  const dirPath = (args['path'] as string) || '.';

  const resolved = safePath(dirPath);
  if (!resolved) {
    return `❌ Error: Path "${dirPath}" is outside the workspace.`;
  }

  try {
    const entries = await readdir(resolved, { withFileTypes: true });
    if (entries.length === 0) {
      return `(empty directory: ${resolved})`;
    }

    const lines = entries.map((e) => {
      const icon = e.isDirectory() ? '📁' : '📄';
      return `${icon} ${e.name}`;
    });
    return `Contents of ${resolved}:\n${lines.join('\n')}`;
  } catch (err) {
    return `❌ Failed to list ${resolved}: ${(err as Error).message}`;
  }
}

/**
 * TOOL: delete_file
 * Deletes a file (not directories — safety measure).
 */
async function deleteFileHandler(args: Record<string, unknown>): Promise<string> {
  const filePath = args['path'] as string;

  const resolved = safePath(filePath);
  if (!resolved) {
    return `❌ Error: Path "${filePath}" is outside the workspace.`;
  }

  try {
    const info = await stat(resolved);
    if (info.isDirectory()) {
      return `❌ Cannot delete directories directly. Delete files individually for safety.`;
    }
    await unlink(resolved);
    return `✅ Deleted: ${resolved}`;
  } catch (err) {
    return `❌ Failed to delete ${resolved}: ${(err as Error).message}`;
  }
}

/**
 * TOOL: file_exists
 * Checks if a file or directory exists.
 */
async function fileExistsHandler(args: Record<string, unknown>): Promise<string> {
  const filePath = args['path'] as string;

  const resolved = safePath(filePath);
  if (!resolved) {
    return `❌ Error: Path "${filePath}" is outside the workspace.`;
  }

  const exists = existsSync(resolved);
  if (exists) {
    const info = await stat(resolved);
    const type = info.isDirectory() ? 'directory' : 'file';
    return `✅ Exists: ${resolved} (${type}, ${info.size} bytes)`;
  }
  return `❌ Does not exist: ${resolved}`;
}

/**
 * TOOL: patch_file
 * Replaces a specific block of text in a file without rewriting the entire file.
 */
async function patchFileHandler(args: Record<string, unknown>): Promise<string> {
  const filePath = args['path'] as string;
  const search = args['search'] as string;
  const replace = args['replace'] as string;

  if (!filePath || typeof search !== 'string' || typeof replace !== 'string') {
    return '❌ Error: "path", "search", and "replace" parameters are required.';
  }

  const resolved = safePath(filePath);
  if (!resolved) {
    return `❌ Error: Path "${filePath}" is outside the workspace.`;
  }

  if (!existsSync(resolved)) {
    return `❌ Error: File "${filePath}" does not exist. Use write_file to create new files.`;
  }

  try {
    const original = await readFile(resolved, 'utf-8');
    const occurrences = original.split(search).length - 1;

    if (occurrences === 0) {
      return `❌ Error: Target text to replace was not found in ${filePath}. Check whitespace and line endings.`;
    }

    if (occurrences > 1) {
      return `❌ Error: Target text found ${occurrences} times in ${filePath}. Please include more surrounding lines in "search" to make the replacement unique.`;
    }

    const updated = original.replace(search, replace);
    await writeFile(resolved, updated, 'utf-8');

    const searchLineCount = search.split('\n').length;
    const replaceLineCount = replace.split('\n').length;
    return `✅ Patched ${filePath}: Replaced ${searchLineCount} lines with ${replaceLineCount} lines cleanly.`;
  } catch (err) {
    return `❌ Failed to patch ${filePath}: ${(err as Error).message}`;
  }
}

/**
 * TOOL: grep_workspace
 * Fast text/regex search across project files, ignoring node_modules, .git, and dist.
 */
async function grepWorkspaceHandler(args: Record<string, unknown>): Promise<string> {
  const query = (args['query'] as string)?.trim();
  const subdir = (args['directory'] as string) || '.';
  const extFilter = (args['extension'] as string)?.replace(/^\./, '').toLowerCase();

  if (!query) return '❌ Error: "query" is required.';

  const resolved = safePath(subdir);
  if (!resolved) return `❌ Error: Path "${subdir}" is outside the workspace.`;
  if (!existsSync(resolved)) return `❌ Error: Directory "${subdir}" does not exist.`;

  const results: string[] = [];
  const maxResults = 30;

  async function scanDir(currentDir: string) {
    if (results.length >= maxResults) return;
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (results.length >= maxResults) return;
      const fullPath = resolve(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'build', '.next', '.cache'].includes(entry.name)) {
          continue;
        }
        await scanDir(fullPath);
      } else if (entry.isFile()) {
        if (extFilter && !entry.name.toLowerCase().endsWith(`.${extFilter}`)) {
          continue;
        }

        try {
          const content = await readFile(fullPath, 'utf-8');
          const lines = content.split('\n');

          lines.forEach((line, index) => {
            if (results.length >= maxResults) return;
            if (line.toLowerCase().includes(query.toLowerCase())) {
              const relPath = relative(config.workspaceRoot, fullPath).replace(/\\/g, '/');
              results.push(`${relPath}:${index + 1}: ${line.trim().slice(0, 140)}`);
            }
          });
        } catch {
          // Skip binary or unreadable files
        }
      }
    }
  }

  await scanDir(resolved);

  if (results.length === 0) {
    return `ℹ️ No matches found for "${query}" in ${subdir}.`;
  }

  return `🔍 Matches for "${query}" (${results.length}${results.length >= maxResults ? '+' : ''}):\n\n` + results.join('\n');
}

/**
 * All filesystem tool definitions, ready to register.
 */
export const filesystemTools: ToolDefinition[] = [
  {
    name: 'write_file',
    description: 'Create or overwrite a file with the given content. Parent directories are created automatically. Path should be relative to the workspace root.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to the workspace root (e.g., "my-project/index.html")',
        },
        content: {
          type: 'string',
          description: 'The full content to write to the file',
        },
      },
      required: ['path', 'content'],
    },
    execute: writeFileHandler,
  },
  {
    name: 'patch_file',
    description: 'Surgically replace a specific unique block of text within an existing file without rewriting the whole file. Saves tokens and preserves the rest of the file.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to the workspace root (e.g., "my-project/src/app.ts")',
        },
        search: {
          type: 'string',
          description: 'The exact string snippet currently in the file to be replaced (must be unique)',
        },
        replace: {
          type: 'string',
          description: 'The new string snippet to substitute in place of the search snippet',
        },
      },
      required: ['path', 'search', 'replace'],
    },
    execute: patchFileHandler,
  },
  {
    name: 'grep_workspace',
    description: 'Search for text, symbols, functions, or patterns across all files in the workspace. Skips node_modules, git, and dist.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The text or symbol to search for across the workspace',
        },
        directory: {
          type: 'string',
          description: 'Optional subfolder within workspace to restrict the search to (default: workspace root)',
        },
        extension: {
          type: 'string',
          description: 'Optional file extension filter (e.g., "ts", "html", "css", "json")',
        },
      },
      required: ['query'],
    },
    execute: grepWorkspaceHandler,
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file. Returns the file text. Path should be relative to the workspace root.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to workspace root (e.g., "my-project/src/main.ts")',
        },
      },
      required: ['path'],
    },
    execute: readFileHandler,
  },
  {
    name: 'list_directory',
    description: 'List all files and folders in a directory. Path should be relative to workspace root. Use "." for the root.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path relative to workspace root (e.g., "my-project/src")',
        },
      },
      required: ['path'],
    },
    execute: listDirHandler,
  },
  {
    name: 'delete_file',
    description: 'Delete a single file. Cannot delete directories for safety. Path should be relative to workspace root.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path to delete, relative to workspace root',
        },
      },
      required: ['path'],
    },
    execute: deleteFileHandler,
  },
  {
    name: 'file_exists',
    description: 'Check if a file or directory exists at the given path. Returns existence status and file info.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to check, relative to workspace root',
        },
      },
      required: ['path'],
    },
    execute: fileExistsHandler,
  },
];
