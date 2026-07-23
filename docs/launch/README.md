# Qarinah public-alpha launch kit

Last verified: 2026-07-22.

This kit is prepared but blocked from publication until every gate in [../LAUNCH.md](../LAUNCH.md) is complete. Qarinah is currently a private repository and is not available from the public npm registry.

## The one-line story

> Stop replaying entire agent histories.

Qarinah keeps permitted project activity and explicit decisions in a local evidence-linked record, then returns only the small cited pack a later agent needs.

## Proof line

> 98.71% less estimated context across six committed software-task fixtures.

Keep the scope beside the number: identical current-task source snippets in both paths; 442,113 estimated tokens for full-history replay versus 5,682 for Qarinah packs plus the same sources; every required target in the top five with direct coverage; no model-written summaries; `ceil(characters / 4)` estimation.

## Who should care

- developers repeatedly re-explaining a codebase to Codex or Claude Code;
- teams that need decisions, approvals, sources, and tool outcomes to remain verifiable;
- maintainers who want a Git-diffable Markdown/OKF view instead of an opaque memory database; and
- governance-sensitive workflows that need explicit capture and disclosure boundaries.

## First proof after release

```sh
npm install --save-dev qarinah@next
npx qarinah init .
npx qarinah record --kind decision --title "Keep releases provenance-bound" --body "Publish only the reviewed artifact."
npx qarinah scan
npx qarinah build
npx qarinah query "release provenance" --minimum-coverage direct --format markdown
npx qarinah doctor
```

## Launch order

1. Complete name, copyright, third-party, secret-history, privacy, and threat-model gates.
2. Pass the full check and real Codex/Claude plugin install matrix on Node.js 22, 24, and 26.
3. Publish the exact reviewed `0.1.0-alpha.3` artifact under npm `next` with provenance and a matching GitHub prerelease.
4. Verify a registry-only install, plugin reinstall, new-task startup, project opt-in, query, doctor, and uninstall.
5. Publish one personally written Show HN submission with a runnable no-signup proof.
6. Publish different technical artifacts during the next week: ledger integrity, retrieval coverage, host integration, benchmark method, and Maqam disclosure.
7. Use Product Hunt only after independent users complete the proof and the public product URL, YouTube demo, support path, and gallery are ready.

## Files

- [Platform copy](PLATFORM-COPY.md)
- [Media matrix](MEDIA-MATRIX.md)
- [Claims checklist](CLAIMS-CHECKLIST.md)

## Success measures

Track clean installs, initialized projects, first direct-evidence packs, second-session reuse, missing-evidence reports, and real integrations. Do not substitute stars, views, or raw npm downloads for activation.
