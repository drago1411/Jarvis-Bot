// JARVIS Calculator Logic
const historyEl = document.getElementById('history');
const currentEl = document.getElementById('current');

let currentInput = '0';
let previousInput = null;
let currentOp = null;
let shouldResetDisplay = false;

function updateDisplay() {
  currentEl.textContent = currentInput;
  if (previousInput !== null && currentOp !== null) {
    historyEl.textContent = `${previousInput} ${currentOp}`;
  } else {
    historyEl.innerHTML = '&nbsp;';
  }
}

function inputDigit(digit) {
  if (currentInput === '0' || shouldResetDisplay) {
    currentInput = digit;
    shouldResetDisplay = false;
  } else {
    if (currentInput.length < 14) {
      currentInput += digit;
    }
  }
  updateDisplay();
}

function inputDecimal() {
  if (shouldResetDisplay) {
    currentInput = '0.';
    shouldResetDisplay = false;
  } else if (!currentInput.includes('.')) {
    currentInput += '.';
  }
  updateDisplay();
}

function clearAll() {
  currentInput = '0';
  previousInput = null;
  currentOp = null;
  shouldResetDisplay = false;
  updateDisplay();
}

function toggleSign() {
  if (currentInput === '0') return;
  if (currentInput.startsWith('-')) {
    currentInput = currentInput.slice(1);
  } else {
    currentInput = '-' + currentInput;
  }
  updateDisplay();
}

function inputPercent() {
  const num = parseFloat(currentInput);
  if (!isNaN(num)) {
    currentInput = String(num / 100);
    updateDisplay();
  }
}

function calculate(a, b, op) {
  switch (op) {
    case '+': return a + b;
    case '−': return a - b;
    case '×': return a * b;
    case '÷': return b === 0 ? 'Error' : a / b;
    default: return b;
  }
}

function setOperator(op) {
  const currentNum = parseFloat(currentInput);

  if (previousInput !== null && currentOp !== null && !shouldResetDisplay) {
    const prevNum = parseFloat(previousInput);
    const result = calculate(prevNum, currentNum, currentOp);
    if (result === 'Error' || isNaN(result)) {
      currentInput = 'Error';
      previousInput = null;
      currentOp = null;
      updateDisplay();
      return;
    }
    // Round to avoid floating point weirdness
    const rounded = Math.round(result * 1e10) / 1e10;
    currentInput = String(rounded);
    previousInput = String(rounded);
  } else {
    previousInput = currentInput;
  }

  currentOp = op;
  shouldResetDisplay = true;
  updateDisplay();
}

function evaluate() {
  if (previousInput === null || currentOp === null) return;

  const a = parseFloat(previousInput);
  const b = parseFloat(currentInput);
  const result = calculate(a, b, currentOp);

  if (result === 'Error' || isNaN(result)) {
    currentInput = 'Error';
  } else {
    const rounded = Math.round(result * 1e10) / 1e10;
    currentInput = String(rounded);
  }

  historyEl.textContent = `${previousInput} ${currentOp} ${b} =`;
  previousInput = null;
  currentOp = null;
  shouldResetDisplay = true;
  currentEl.textContent = currentInput;
}

// Attach event listeners to all keys
document.querySelectorAll('.key').forEach(btn => {
  btn.addEventListener('click', () => {
    const digit = btn.getAttribute('data-digit');
    const op = btn.getAttribute('data-op');
    const action = btn.getAttribute('data-action');

    if (digit !== null) {
      inputDigit(digit);
    } else if (op !== null) {
      setOperator(op);
    } else if (action !== null) {
      switch (action) {
        case 'clear': clearAll(); break;
        case 'toggle-sign': toggleSign(); break;
        case 'percent': inputPercent(); break;
        case 'decimal': inputDecimal(); break;
        case 'equals': evaluate(); break;
      }
    }
  });
});

// Keyboard support
window.addEventListener('keydown', (e) => {
  if (e.key >= '0' && e.key <= '9') inputDigit(e.key);
  else if (e.key === '.') inputDecimal();
  else if (e.key === '+') setOperator('+');
  else if (e.key === '-') setOperator('−');
  else if (e.key === '*' || e.key === 'x') setOperator('×');
  else if (e.key === '/') { e.preventDefault(); setOperator('÷'); }
  else if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); evaluate(); }
  else if (e.key === 'Escape') clearAll();
  else if (e.key === '%') inputPercent();
});

updateDisplay();
