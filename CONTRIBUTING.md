# Contributing to Qarinah

Thank you for improving Qarinah. Security boundaries, evidence fidelity, and reproducibility take priority over convenience.

## Development

Use a maintained Node.js 22, 24, or 26 release.

```sh
npm ci
npm run check
```

Public API changes must update exports, TypeScript declarations, JSON schemas, consumer tests, and migration notes together. Treat prompts, tool results, retrieved content, paths, and plugin configuration as untrusted input.

## Developer Certificate of Origin

Qarinah uses the Developer Certificate of Origin 1.1. Sign every commit with:

```text
Signed-off-by: Your Name <your-email@example.com>
```

Use `git commit -s`. By signing off, you certify the contribution under the [Developer Certificate of Origin 1.1](https://developercertificate.org/).

## Pull requests

- Keep each pull request focused.
- Add tests for behavior and security boundaries.
- Document benchmark fixtures and negative cases.
- Do not include secrets, private transcripts, hidden reasoning, copied third-party code, or generated assets without documented rights.
- Report vulnerabilities privately through GitHub Security Advisories instead of a public issue.
