(Reference only. The guard does NOT use an LLM to decide risk.)

Risk decisions are made by the deterministic rule engine and policy engine.
This file documents the review checklist a human reviewer can use when adding rules:

1. What resource does the command change? (files, permissions, history, database, cloud, processes)
2. Is the change reversible? (trash, git reflog, backups, plan/apply)
3. How broad is it? (single file, directory tree, whole system)
4. Does it depend on a variable, glob or substitution whose value is unknown?
5. Does it use elevated privileges or touch a configured production target?
