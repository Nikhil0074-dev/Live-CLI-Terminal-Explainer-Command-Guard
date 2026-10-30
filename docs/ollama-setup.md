# Ollama setup (optional)

1. Install Ollama from https://ollama.com and start it (`ollama serve`).
2. Pull a model that fits your RAM. Smaller models answer faster; quality varies.
3. Create the config: `guard config init`, then set `ai.model` to the model name from `ollama list`.
4. Check: `guard doctor` shows "Ollama reachable" and 'Model "..." installed'.
5. Use: `guard explain "<command>"`, or add `--ai` to `check` / `run`.

Settings: `ai.baseUrl` (default `http://127.0.0.1:11434`), `ai.timeoutMs` (default 8000), `ai.enabled`.

Behaviour when AI is unavailable: the built-in explainer is used, an "AI explanation unavailable" note is shown,
and all security decisions are unchanged. `security.allowExecutionWhenAiUnavailable=false` makes `guard run --ai`
refuse to execute if the AI you explicitly asked for failed (it never affects runs without `--ai`).
