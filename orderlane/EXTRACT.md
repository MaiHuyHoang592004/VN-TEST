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
npm test                      # 171 tests; needs DATABASE_URL for 96 of them
bash scripts/check-clean-room.sh
```

Then set the copyright holder in `LICENSE` to your own name, create the empty
repository on GitHub, and push. Nothing in this tree names a remote, so there
is no leftover origin to remove.
