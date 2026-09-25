# Repository security and branch workflow

The official repository is public and `main` is its default branch. Public
visibility permits reading, cloning, and forks; it does not grant push or release
access. Existing collaborator permissions remain separate from branch rules.

## Enforced branch rules

The repository's active GitHub rulesets cover:

- **Every current and future branch:** no force pushes and no branch deletion.
  There are no bypass actors for these history protections.
- **`main` and the default branch:** changes must arrive through a pull request,
  pass required checks against the latest base, resolve review conversations,
  and use a squash merge with linear history. No actor can bypass this merge gate.
- **Maintainer review:** one current approval and a code-owner review are required
  for contributor changes. Pushing new changes dismisses old approvals, and the
  latest push must be approved by someone else.
- **Release tags:** existing tags cannot be rewritten or deleted.

The sole review exception is the repository owner, `AjnasNB`, who may merge a
pull request without a second person's approval. GitHub does not permit authors
to approve their own pull requests. This exception applies only to the review
ruleset and only through a pull request; it never bypasses CI, the required pull
request, resolved conversations, or history protection. It is recorded by GitHub
as a ruleset bypass. It does not allow a direct push to `main`.

Required checks are the nine Linux/macOS/Windows and Node 22/24/26 verification
jobs, the supply-chain audit, dependency review, CodeQL analysis, and the secret
scan. The checks are bound to the GitHub Actions integration. Review current
enforcement under **Settings → Rules → Rulesets**; documentation itself does not
enforce GitHub settings.

## Pull and push

Start each change from the current default branch:

```sh
git switch main
git pull --ff-only origin main
git switch -c fix/descriptive-change
# Make and verify the change.
npm ci
npm run check
git add path/to/changed-file
git commit -s -m "fix: describe the change"
git push -u origin fix/descriptive-change
gh pr create --base main
```

Contributors without write access push to their own fork and open a pull request
against `AjnasNB/qarinah:main`. Maintainers can make normal, forward-only pushes to
feature branches. To update an already-published branch, merge `origin/main` into
it and push normally; do not rebase published commits or use `--force`, including
`--force-with-lease`. Squash merging keeps the resulting `main` history linear.
Automatic branch deletion is disabled to respect the all-branch deletion rule.

## Automation and releases

Workflow tokens default to read-only and cannot approve pull requests. External
fork workflows need maintainer approval. Actions are pinned to complete commit
SHAs, and checkouts do not persist credentials.

The `npm-publish` and `website` environments accept only `main` and require the
owner's approval. Publishing and deployment remain manual workflows that verify
the exact expected commit and release identity. Never expose release credentials
to pull-request jobs or run a contributor checkout in `pull_request_target`.

Secret scanning and push protection, dependency alerts and security updates, and
private vulnerability reporting are enabled. Use [SECURITY.md](../SECURITY.md)
for private reports.

## Historical secret-scan findings

Before restoring public access on September 25, 2026, Gitleaks 8.30.1 scanned
all 160 commits reachable from the fetched branches and tags. Its five findings
were reviewed: three matched benchmark citation identifiers
(`bm25-okapi-trec-3` followed by `longmemeval-iclr-2025`), and two matched synthetic
PEM-shaped redaction fixtures containing plaintext markers instead of key
material. `.gitleaksignore` contains only those exact historical fingerprints.
New commits and changed fixtures are scanned normally; no entire file or rule
is excluded. A scan reduces risk but cannot establish that a repository contains
no possible sensitive information.

Repository administrators retain GitHub's ability to edit settings. Changes to
these controls should be deliberate, documented, and restored after any necessary
exception; never weaken a gate simply to merge a failing change.
