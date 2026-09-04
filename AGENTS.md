# J.A.R.V.I.S. — Personal AI Developer Assistant

A personal AI developer assistant inspired by Iron Man's J.A.R.V.I.S., built with Node.js/TypeScript, Vite HUD interface, Groq LLM inference, SQLite persistent memory, and autonomous dev tools.

## Architecture

- **`server/`** — Express + TypeScript backend:
  - ReAct agent orchestrator streaming SSE events to the UI.
  - Multi-tool subsystem: filesystem, shell execution, testing (Vitest), git, npm, web search/RSS, static security review.
  - SQLite persistence (`jarvis.db`) for conversation history, user preferences, project registry, and persistent facts.
- **`ui/`** — Sci-fi HUD frontend built with Vite, TypeScript, and CSS:
  - Live chat with streaming assistant responses & tool activity feeds.
  - Arc Reactor visual states and interactive command approval modal.
  - Real-time telemetry (CPU, RAM, Disk, Uptime) & Market Tickers.
  - In-app live preview for generated web applications.
- **`workbench/projects/`** — Sandbox workspace where JARVIS creates, tests, and builds web applications.

## How to Run Locally

1. **Environment Setup**:
   Ensure `GROQ_API_KEY` is set in your `.env` file in the root directory:
   ```env
   GROQ_API_KEY=gsk_...
   ```

2. **Start Backend Server**:
   ```bash
   cd D:\Jarvis\server
   npm run dev
   ```
   (Runs on `http://localhost:3000`)

3. **Start Frontend HUD**:
   ```bash
   cd D:\Jarvis\ui
   npm run dev
   ```
   (Runs on `http://localhost:5173`)

4. **Or Use the One-Click Launcher**:
   - Double-click `start-jarvis.bat` from the root directory.

