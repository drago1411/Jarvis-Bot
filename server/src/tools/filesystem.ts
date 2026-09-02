import { readFile, writeFile, readdir, mkdir, unlink, stat } from 'fs/promises';
import { resolve, dirname, join } from 'path';
import { existsSync } from 'fs';
import { config } from '../config.js';
import type { ToolDefinition } from '../types.js';

/**
 * Resolves a path relative to the workspace root.
 * If an absolute path is given, it must be within the workspace.
 * Returns null if the path is outside the allowed workspace.
 */
function safePath(filePath: string): string | null {
  const root = config.workspaceRoot;
  const resolved = resolve(root, filePath);

  // Security: prevent path traversal outside workspace
  if (!resolved.startsWith(resolve(root))) {
    return null;
  }
  return resolved;
}

/**
 * TOOL: write_file
 * Creates or overwrites a file. Creates parent directories automatically.
 */
async function writeFileHandler(args: Record<string, unknown>): Promise<string> {
  const filePath = args['path'] as string;
  const content = args['content'] as string;

  const resolved = safePath(filePath);
  if (!resolved) {
    return `❌ Error: Path "${filePath}" is outside the workspace. Files must be inside ${config.workspaceRoot}`;
  }

  try {
    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(resolved, content, 'utf-8');
    return `✅ Written: ${resolved} (${Buffer.byteLength(content, 'utf-8')} bytes)`;
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
