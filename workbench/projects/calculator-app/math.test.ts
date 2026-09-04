import { describe, it, expect } from 'vitest';

function add(a: number, b: number): number {
  return a + b;
}

function multiply(a: number, b: number): number {
  return a * b;
}

describe('Calculator Math Logic', () => {
  it('should correctly add two numbers', () => {
    expect(add(15, 25)).toBe(40);
  });

  it('should correctly multiply two numbers', () => {
    expect(multiply(6, 7)).toBe(42);
  });

  it('should handle zero and negative numbers', () => {
    expect(add(-5, 5)).toBe(0);
    expect(multiply(-3, 4)).toBe(-12);
  });
});
