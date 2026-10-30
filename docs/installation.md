# Installation

## Linux / macOS
```bash
git clone <your repo> && cd live-cli-terminal-explainer   # or unzip the archive
npm install && npm run build && npm test
npm link                                                  # optional global `guard`
guard doctor
guard install-hook bash   # or zsh
```

## Windows
The core CLI (`explain`, `check`, `run` for simple commands) runs on Node.js. The Bash/Zsh hooks need a POSIX shell:
use **WSL** (recommended) or Git Bash. PowerShell is not supported yet (different syntax; planned as a separate adapter).
Shell-syntax commands passed as one string run through `cmd.exe` on Windows and are not analysed as POSIX.

## Verify
`guard doctor` must print "All required security components are working". Ollama lines are optional.
