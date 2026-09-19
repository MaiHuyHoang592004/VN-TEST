# Lifting this directory into its own repository

This tree is staged inside a private working repository. It is meant to become
a standalone public repository with a history of its own, and the way it gets
there matters.

**Copy the files. Do not carry the history.**

```bash
bash scripts/extract.sh ~/orderlane
```

That script copies the tree (without `.git`, `node_modules`, build output or
generated code), removes this file, starts a new history with one commit, and
runs the clean-room gate over the result.

**Do not** use `git subtree split`, `git filter-repo`, or add the staging
repository as a remote. All three carry commits across, and the commits are the
thing being left behind: a clean history is one with nothing in it to sanitise,
not one that has been sanitised.

The staging repository stays private. It is a reference, not an upstream.

## Before the first push

```bash
cd ~/orderlane
npm ci
npm run generate -w @orderlane/db
npm test                      # 198 tests; needs DATABASE_URL for 104 of them
bash scripts/check-clean-room.sh
```

Then set the copyright holder in `LICENSE` to your own name, create the empty
repository on GitHub, and push. Nothing in this tree names a remote, so there
is no leftover origin to remove.

## What "clean" has been verified to mean

The extraction was run and the result checked, rather than assumed:

| Check | Result |
|---|---|
| `check-clean-room.sh`, working tree | clean, 6 categories |
| `check-clean-room.sh`, commit history | clean, 3 categories over the single commit |
| `npm ci` from the lockfile | 191 packages, no drift |
| `prisma validate` · `generate` · `migrate deploy` | pass, against an empty database |
| `npm run typecheck` | 4/4 packages |
| `npm test` | 198 tests, 0 failures |
| `npm run build` | pass |
| `npm run db:seed` | 2 tenants, 52 orders, 44 fulfillments |
| Seed determinism | two fresh databases, identical generated content (same checksum) |

Re-run after the security review, with its four fixes in: 129 files, one
commit, no remote, and every step above still green.

Two false positives in the gate were found by running it on the extracted
repository, and fixed there rather than waived:

- `git log -S` matched the denylist inside the gate script itself, so the
  commit that *adds* the check reported every banned term. The diff scan now
  excludes that one path.
- `git@github.com` in a printed instruction was read as an email address. It is
  an SSH user and host; it is allowlisted.

Both mattered more than they look. The first fires on a spotless repository at
exactly the moment somebody would decide the check is noise.
