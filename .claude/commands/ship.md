---
description: Ship the current branch - checks, push, PR, merge, update main (run only after the owner says "ship it")
---

Ship the current branch. Run these steps in order and **stop with a clear one-line message at the first failure**. Never force-push, never push to main, never squash, never touch any repo other than the one in step 1. Use `tail -20` on check output. Give the owner commands in PowerShell syntax.

1. **Remote.** `git remote get-url origin` must be `github.com/syedeeshanqadri/calvy-v2` (with or without `https://` and `.git`). Anything else (especially `itsaamir-dev/calvy.io`): refuse and stop.
2. **Branch and tree.** `git branch --show-current` must not be `main`. If `git status --short` shows changes, commit them with a sensible message (include the attribution line from the session), then continue.
3. **Checks.** `npm run lint`, `npx tsc --noEmit` (ignore stale `.next/` errors), `npm test`. Stop if any fails and show the last 20 lines.
4. **Sync.** `git fetch origin`, then `git merge origin/main`. On conflicts: stop, list the conflicted files, do not resolve them. If the merge brought in changes, re-run step 3.
5. **Push.** `git push -u origin <branch>` (branch must match step-*, fix/*, port/*, design/* or chore/*).
6. **PR.** `gh pr list --head <branch> --state open`; reuse the PR if one exists, otherwise `gh pr create --base main --fill`.
7. **Merge.** `gh pr merge <number> --merge --delete-branch` (merge commit only).
8. **Update main.** `git switch main`, `git pull`, `npm install`, `npm run db:migrate`, `npm run db:generate`.
9. **Report, max 6 lines:** PR number and URL, merged yes/no, main updated, migrations applied (count or "none"), anything that needs the owner.
