# Qarinah public launch kit

Last verified: 2026-08-10.

Qarinah is public on GitHub, npm, and qarinah.io. Use this kit for reviewed launch copy and keep every benchmark qualification beside the result. Future package or website changes still follow the gates in [../LAUNCH.md](../LAUNCH.md).

## The one-line story

> Send 98.71% less repeated project context. Keep the proof.

Your project remembers even when your coding agent changes. Qarinah keeps permitted project activity and explicit decisions in a local evidence-linked record, then returns a small cited pack for a verified handoff.

## Proof line

> 98.71% less estimated context.

Keep the scope beside the number: identical current-task source snippets in both paths; 442,113 estimated tokens for full-history replay versus 5,682 for Qarinah packs plus the same sources; every required target in the top five with direct coverage; no model-written summaries; `ceil(characters / 4)` estimation.

Equivalent fixture-bound proof: 436,431 fewer estimated input-context tokens and a 77.81:1 baseline-to-pack ratio - the full-history baseline contained 77.81 times as many estimated tokens as the Qarinah path. At a flat $3 per million uncached input tokens, the aggregate slice estimates $1.326339 versus $0.017046, saving $1.309293 per repeat. Separate scale proof: 380 / 380 file-specific exact and typo-tolerant queries ranked the target first. These are not provider billing receipts, 77.81-times-longer session evidence, or universal task-quality guarantees.

## Who should care

- developers repeatedly re-explaining a codebase to Codex or Claude Code;
- teams that need decisions, approvals, sources, and tool outcomes to remain verifiable;
- maintainers who want a Git-diffable Markdown/OKF view instead of an opaque memory database; and
- governance-sensitive workflows that need explicit capture and disclosure boundaries.

## First proof after release

```sh
npm install --save-dev qarinah
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
3. Publish the exact reviewed `0.1.0` artifact under npm `latest` with provenance and a matching GitHub release.
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
