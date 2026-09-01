# JARVIS — Developer Assistant Project

This project (on D:\Jarvis) contains your JARVIS agent configuration for opencode.

## What's here

- `.opencode/agent/jarvis.md` — the JARVIS agent definition (personality + instructions).
- `opencode.json` — registers the local Ollama provider and sets JARVIS as default agent.
- `workbench/` — (optional) place websites/apps you build with JARVIS here.

## How to use

1. Make sure Ollama is running and `qwen3:8b` is pulled:
   - `ollama serve` (or the Ollama app)
   - `ollama pull qwen3:8b`
2. Launch opencode **from this directory** (`D:\Jarvis`):
   - `opencode`
3. JARVIS will be your default agent. Just type natural-language requests, e.g.:
   - "Create a homepage with a hero and two feature sections"
   - "Add a contact form to the Contact page"
   - "Run the tests and fix failures"

## Notes

- The `model` field uses `ollama/qwen3:8b`. Change to another pulled model if you prefer.
- If Ollama isn't reachable, opencode may fail to load the model — start Ollama first.
