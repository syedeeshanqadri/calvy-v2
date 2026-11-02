---
description: Ship the current branch end to end - checks, push, PR, wait for CI, auto-merge, update main (run only after the owner says "ship it")
---

Ship the current branch, fully automatic. Run these steps in order and **stop with a clear one-line message at the first failure** unless a step says otherwise. Never force-push, never push to main, never squash, never touch any repo other than the one in step 1. Use `tail -20` on check output. Give the owner commands in PowerShell syntax. The waiting in steps 6 and 8 is the one exception to the "never poll or wait" rule in CLAUDE.md.

1. **Remote.** `git remote get-url origin` must be `github.com/syedeeshanqadri/calvy-v2` (with or without `https://` and `.git`). Anything else (especially `itsaamir-dev/calvy.io`): refuse and stop.
2. **Branch and tree.** `git branch --show-current` must not be `main`, and must match step-*, fix/*, port/*, design/* or chore/*. `git status --short` must be clean, ignoring `next-env.d.ts`, `.vscode/` and `etc/`; otherwise stop and list the files.
3. **Checks.** `npm run lint`, `npx tsc --noEmit` (ignore stale `.next/` errors), `npm test`. Stop if any fails and show the last 20 lines.
4. **Sync.** `git fetch origin`, then `git merge origin/main`. On conflicts: stop, list the conflicted files, do not resolve them. If the merge brought in changes, re-run step 3.
5. **Push and PR.** `git push -u origin <branch>`. `gh pr list --head <branch> --state open`; reuse the PR if one exists, otherwise `gh pr create --base main --fill`. Append the session's PR attribution line to the body if there is one (`gh pr edit <n> --body ...`).
6. **Wait for checks.** `gh pr checks <n> --watch` (if it reports no checks just after the push, wait 30 seconds and retry). If a check fails: show the failing check and a summary of its log (`gh run view <run-id> --log-failed | tail -40`), fix it on the branch, re-run step 3, commit, push, and watch again. Stop and ask the owner if the same check fails twice, or if the fix is not clearly within this branch's work.
7. **Merge.** `gh pr merge <n> --auto --merge --delete-branch` (merge commit only). This comes after step 6 because `main` has no required checks: GitHub would otherwise merge at once, without waiting for CI. If the safety check blocks this command, stop and give the owner the exact command to approve once with "don't ask again".
8. **Wait for the merge.** Poll `gh pr view <n> --json state -q .state` until `MERGED`, timeout 15 minutes. On timeout, stop and report the state.
9. **Update main.** `git switch main`, `git pull`, `npm install`, `npm run db:migrate`, `npm run db:generate`. If `npm install` or `db:generate` hits EPERM, tell the owner to stop the dev server and rerun only that step. If `db:migrate` cannot reach the database, say so and give the command to rerun.
10. **Report, max 6 lines:** PR number and URL, checks result, merged yes/no, migrations applied (count or "none"), anything that needs the owner.
