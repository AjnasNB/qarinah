# Qarinah governance

Qarinah is an open-source project stewarded by its maintainer. Contributions are welcomed on technical merit, compatibility, evidence quality, user safety, and fit with the project direction.

## Roles

### Users

Users install Qarinah, report reproducible defects, propose use cases, and test published interfaces.

### Contributors

Contributors submit signed commits, tests, documentation, designs, or security reports. A merged contribution does not automatically grant release or repository administration authority.

### Maintainer

The maintainer reviews and merges changes, resolves product direction, manages releases and security disclosures, and protects the project's integrity and brand. Additional maintainers may be appointed after sustained, trusted contribution.

## Decisions

Small implementation decisions happen in focused pull requests. Changes to the event contract, trust model, capture defaults, storage identity, public APIs, licensing, or release process should begin with an issue or discussion that records:

- the user problem;
- the proposed contract;
- compatibility and migration effects;
- privacy and security consequences;
- test and evidence requirements;
- alternatives considered.

The maintainer seeks useful consensus but may make the final decision when tradeoffs remain. Decisions should be explained in the issue, pull request, migration note, or architecture record rather than hidden in private conversation.

## Merge and release authority

A pull request requires passing checks and an exact-commit review appropriate to its risk. Security-sensitive and release-bound changes require explicit maintainer review.

Only maintainers may:

- publish npm packages;
- create release tags and GitHub releases;
- deploy official documentation;
- change branch protection, trusted publishing, or security settings;
- represent a build as an official Qarinah release.

Official releases must be built from the reviewed main-branch commit, pass the repository's clean-install verification, and preserve the npm, Git tag, GitHub release, and documentation identity described in `docs/LAUNCH.md`.

## Security

Security reports follow [SECURITY.md](SECURITY.md). The maintainer may temporarily keep a fix private, restrict discussion, or delay public detail while affected users can upgrade.

## Project assets and brand

Source contributions are licensed under Apache License 2.0 and certified through the Developer Certificate of Origin. Brand use follows [TRADEMARKS.md](TRADEMARKS.md). Open-source licensing permits compliant forks and commercial use; it does not transfer control of the official repository, releases, domains, package identity, or marks.

## Changes to governance

Governance changes use the same reviewed pull-request process and should explain why the existing process no longer serves contributors or users.
