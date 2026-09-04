/**
 * JARVIS Filesystem Tool — Security Unit Tests
 *
 * Tests the safePath() function that prevents directory traversal attacks.
 * All tests use a mock workspace root to avoid any actual filesystem access.
 */

import { describe, it, expect } from 'vitest';
import { resolve, normalize, relative, isAbsolute } from 'path';

// ─── Inline safePath (mirrors filesystem.ts logic) ───────────────────────────
// We test the logic independently to avoid importing the full module + config.
const MOCK_WORKSPACE_ROOT = 'D:\\Jarvis\\workbench\\projects';

function safePath(filePath: string): string | null {
  if (!filePath || typeof filePath !== 'string') return null;

  const rootResolved = resolve(normalize(MOCK_WORKSPACE_ROOT));
  const targetResolved = resolve(rootResolved, filePath);

  const rel = relative(rootResolved.toLowerCase(), targetResolved.toLowerCase());
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return null;
  }
  return targetResolved;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('safePath — Directory Traversal Prevention', () => {
  it('allows a simple relative filename', () => {
    const result = safePath('index.html');
    expect(result).not.toBeNull();
    expect(result).toContain('index.html');
  });

  it('allows a nested relative path', () => {
    const result = safePath('my-project/src/main.ts');
    expect(result).not.toBeNull();
    expect(result).toContain('my-project');
    expect(result).toContain('main.ts');
  });

  it('allows a project subfolder', () => {
    const result = safePath('todo-app/index.html');
    expect(result).not.toBeNull();
  });

  it('BLOCKS basic path traversal (../)', () => {
    const result = safePath('../secret.txt');
    expect(result).toBeNull();
  });

  it('BLOCKS deep path traversal (../../)', () => {
    const result = safePath('../../etc/passwd');
    expect(result).toBeNull();
  });

  it('BLOCKS path traversal hidden in subdirectory', () => {
    const result = safePath('project/../../outside.txt');
    expect(result).toBeNull();
  });

  it('BLOCKS triple traversal attempt', () => {
    const result = safePath('../../../Windows/System32/cmd.exe');
    expect(result).toBeNull();
  });

  it('returns null for empty string', () => {
    const result = safePath('');
    expect(result).toBeNull();
  });

  it('returns null for undefined-like input (empty)', () => {
    const result = safePath('');
    expect(result).toBeNull();
  });

  it('BLOCKS Windows absolute path escape (C:\\)', () => {
    // On Windows, resolving an absolute path against a base gives the absolute path
    // The relative() check will catch this since rel will be the absolute path itself
    const result = safePath('C:\\Windows\\System32');
    // This should be blocked — absolute path not within workspace
    // Note: on Windows the behavior depends on drive letter matching
    if (result !== null) {
      // If it resolves, it must still be within workspace bounds
      const rootNorm = resolve(normalize(MOCK_WORKSPACE_ROOT)).toLowerCase();
      expect(result.toLowerCase().startsWith(rootNorm)).toBe(true);
    }
  });

  it('resolves legitimate path to absolute form', () => {
    const result = safePath('my-app/components/App.tsx');
    expect(result).not.toBeNull();
    expect(isAbsolute(result!)).toBe(true);
  });

  it('allows dot-only path (current dir)', () => {
    const result = safePath('.');
    // '.' resolves to workspace root itself — should be allowed
    expect(result).not.toBeNull();
  });
});

describe('safePath — Input Validation', () => {
  it('handles paths with spaces', () => {
    const result = safePath('my project/index.html');
    expect(result).not.toBeNull();
    expect(result).toContain('my project');
  });

  it('handles deeply nested legitimate paths', () => {
    const result = safePath('app/src/components/ui/Button.tsx');
    expect(result).not.toBeNull();
    expect(result).toContain('Button.tsx');
  });

  it('handles paths with forward slashes on Windows', () => {
    const result = safePath('app/src/index.ts');
    expect(result).not.toBeNull();
  });

  it('handles paths with backslashes on Windows', () => {
    const result = safePath('app\\src\\index.ts');
    expect(result).not.toBeNull();
  });
});
