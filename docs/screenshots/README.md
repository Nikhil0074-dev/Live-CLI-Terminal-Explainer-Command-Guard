# Screenshots

These PNGs are rendered from **real captured output** of the tool (not mock-ups). They are produced by
`capture.sh`, `capture_hook.py` and `scripts/render_terminal.py`, so you can regenerate them yourself
(`npm run build && bash docs/screenshots/capture.sh`). They are rendered images of terminal text, not OS-level
window captures.

| File | Shows |
|---|---|
| 01-explain-find.png | `guard explain` for `find ... -delete` |
| 02-check-high-risk.png | HIGH risk analysis of `sudo chmod -R 777 /var/www` |
| 03-check-blocked.png | `rm -rf /` blocked |
| 04-check-pipe-to-shell.png | `curl ... \| bash` flagged |
| 05-run-cancelled.png | Confirmation prompt, user answers `n`, nothing deleted |
| 06-run-approved.png | Confirmation prompt, user answers `y`, directory removed |
| 07-run-protected-blocked.png | Protected directory is blocked, no prompt |
| 08-check-json.png | `--json` output for scripting |
| 09-history.png | Audit history (no raw commands) |
| 10-doctor.png | `guard doctor` with Ollama offline (optional) |
| 11-bash-hook-session.png | Real interactive Bash session with the hook |
| 11-zsh-hook-session.png | Real interactive Zsh session with the hook |
| 12-tests-passing.png | 343 unit + integration tests passing |
