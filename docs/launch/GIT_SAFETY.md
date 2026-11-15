# Moving the local work into the real repository (safely)

**Status (checked):** `D:\skandasramam-main` is **not** a Git repository (`git rev-parse` fails). There is no
history, so nothing here can be diffed against GitHub until it is placed in a clone. Nothing below deletes,
overwrites, pushes or merges anything.

## Procedure

1. **Back up first.** Copy the whole folder somewhere else (for example `D:\skandasramam-backup-2026-11-15`),
   or zip it, excluding `node_modules` and `dist`. Keep it until the work is safely committed.
2. **Clone into a NEW, empty folder** (never into the existing one):
   ```
   git clone https://github.com/skandatechco/skandasramam.git D:\skandasramam-repo
   cd D:\skandasramam-repo
   git switch -c integration/launch-readiness
   ```
3. **See what actually differs** before copying anything (read-only):
   ```
   git diff --no-index --stat D:\skandasramam-repo D:\skandasramam-main
   ```
   Ignore `node_modules`, `dist`, `.git`. Files only in the repo are upstream work that is NOT in your local
   copy (someone else changed them, or your copy is older): do not overwrite them, review them one by one.
   Files only locally are the new work (`shared/`, `server/lib`, `supabase/`, `docs/`, ...).
4. **Copy the local work in on that branch**, file by file or folder by folder, never with delete/mirror
   options. With `robocopy` use `/E` only (no `/MIR`, no `/PURGE`) and exclude `.git`, `node_modules`, `dist`,
   `.env`, `.env.local`. For any file that exists in both, compare with `git diff` and merge by hand.
5. **Review, then commit locally** on the branch: `git status`, `git diff`, then `git add -p` / `git commit`.
   Do **not** push and do **not** merge into `main` until you approve.
6. When approved, push the branch (not `main`) and open a pull request; Vercel will build a preview from it.

## Cautions

- `.gitignore` currently ignores `*.local` but **not `.env`**. Keep real secrets only in `.env.local` / Vercel
  settings. The checked-in `.env` must stay free of secrets (it currently holds none).
- Never copy `.env.local`, `node_modules` or `dist` into the clone.
- If the clone's history already contains an older version of files that were changed here (for example
  `server/index.ts`), those show up as modifications in step 3, which is what you want to review.
