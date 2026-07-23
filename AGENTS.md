<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Working across multiple machines

This repo is edited from more than one machine, each running Claude Code. **Any push to `main` auto-deploys to Vercel production** via the GitHub integration. To avoid machines clobbering each other (this already orphaned a day of work once):

- **Pull before you start and before every push:** `git pull --rebase`. `pull.rebase` is set true.
- **Push small and often** so the other machine can pull your work.
- **Never force-push `main`** (`git push -f` / `--force`). If a push is rejected, `git pull --rebase` then push again.
- **Never run `vercel --prod` or any manual/local deploy.** Pushing `main` is the deploy. Deploying local files puts the live site ahead of GitHub — the exact drift to avoid. If the GitHub integration is down, first make local `HEAD` equal `origin/main`.
- For risky or parallel work, use a branch and merge to `main` deliberately — only `main` deploys.
