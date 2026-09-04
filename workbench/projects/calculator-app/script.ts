type Operator = "+" | "−" | "×" | "÷";

interface CalcState {
  current: string;
  previous: string | null;
  operator: Operator | null;
  justEvaluated: boolean;
}

const initial: CalcState = {
  current: "0",
  previous: null,
  operator: null,
  justEvaluated: false
};

function fmt(n: number): string {
  if (!isFinite(n)) return "Error";
  const r = Math.round(n * 1e10) / 1e10;
  return String(r);
}

function compute(a: number, b: number, op: Operator): number {
  switch (op) {
    case "+": return a + b;
    case "−": return a - b;
    case "×": return a * b;
    case "÷": return b === 0 ? NaN : a / b;
  }
}

class Calculator {
  private state: CalcState = { ...initial };

  get current(): string { return this.state.current; }

  get history(): string {
    if (!this.state.previous || !this.state.operator) return " ";
    return `${this.state.previous} ${this.state.operator}`;
  }

  inputDigit(d: string): void {
    if (this.state.justEvaluated) {
      this.state = { ...initial, current: d };
      return;
    }
    if (this.state.current === "0" || this.state.current === "Error") {
      this.state.current = d;
    } else if (this.state.current.length < 15) {
      this.state.current += d;
    }
  }

  decimal(): void {
    if (this.state.justEvaluated) {
      this.state = { ...initial, current: "0." };
      return;
    }
    if (!this.state.current.includes(".")) this.state.current += ".";
  }

  setOperator(op: Operator): void {
    if (this.state.current === "Error") return;
    if (this.state.operator && !this.state.justEvaluated && this.state.previous !== null) {
      this.equals();
    }
    this.state.previous = this.state.current;
    this.state.operator = op;
    this.state.current = "0";
    this.state.justEvaluated = false;
  }

  equals(): void {
    if (!this.state.operator || this.state.previous === null) return;
    const a = parseFloat(this.state.previous);
    const b = parseFloat(this.state.current);
    const result = compute(a, b, this.state.operator);
    this.state = {
      ...