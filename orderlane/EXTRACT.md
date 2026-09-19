# Lifting this directory into its own repository

This tree is staged inside a private working repository. It is meant to become
a standalone public repository with a history of its own, and the way it gets
there matters.

**Copy the files. Do not carry the history.**

```bash
cp -r orderlane ~/orderlane
cd ~/orderlane
rm EXTRACT.md
git init
git add .
git commit -m "Initial public release"
```

Then check the gate before the first push:

```bash
bash scripts/check-clean-room.sh
```

**Do not** use `git subtree split`, `git filter-repo`, or add the staging
repository as a remote. All three carry commits across, and the commits are the
thing being left behind — the point of a clean history is that there is nothing
in it to sanitise.

The staging repository stays private. It is a reference, not an upstream.
