# Lossless content archive

Qarinah uses two different storage layers for two different jobs:

- the event ledger and context packs keep a small, cited working memory for agents;
- the optional content archive preserves the exact bytes of explicitly selected project files.

The archive does not claim that a large project becomes a few kilobytes. It uses content-defined chunking, cross-snapshot deduplication, Brotli compression when beneficial, authenticated AES-256-GCM encryption, and SHA-256 verification. Compact packs can reference archive receipts without placing the complete source into every model prompt.

## Authorization and exclusions

Raw archival is available only in a workspace initialized with `--capture content`:

```powershell
npx qarinah init --capture content
npx qarinah archive create . --label "project source"
```

The source must stay inside the workspace and outside `.qarinah`. Qarinah does not follow symbolic links, junctions, or multiply-linked files. It honors `.gitignore` and `.qarinahignore`, excludes generated/dependency directories, and refuses common credential and private-key filenames. These defenses reduce accidental capture; maintainers must still review the selected source and ignore rules.

## Storage model

Each manifest records exact file hashes and ordered chunk descriptors. Identical plaintext chunks within the same local vault reuse one encrypted object, including across later snapshots. Objects are stored under a key-scoped path:

```text
.qarinah/archive/
|-- key.json
|-- manifests/archive_<sha256>.json
`-- objects/key_<id>/obj_<sha256>.qar
```

The vault key is a local adjacent file protected by filesystem permissions. This is useful local authenticated encryption, not an operating-system keystore, hardware-security module, remote key-management service, or protection from an attacker who can read both the key and objects. Back up or wrap the key separately if organizational policy requires it.

## Verify and restore

```powershell
npx qarinah archive list
npx qarinah archive verify archive_<sha256>
npx qarinah archive restore archive_<sha256> --destination D:\restored-project
```

Verification decrypts every referenced object, checks authenticated-encryption tags, reconstructs every file, and checks its SHA-256 digest. Restore rejects path escape and existing output files. Use a new destination and compare the returned receipt before replacing a working copy.

## Deletion and cryptographic erasure

Destructive operations require exact identifiers:

```powershell
npx qarinah archive delete archive_<sha256> --confirm archive_<sha256>
npx qarinah archive gc --confirm-workspace ws_<id>
npx qarinah archive erase-key --confirm-workspace ws_<id>
```

Deleting a manifest does not immediately delete shared objects. Garbage collection removes objects no remaining manifest references. Destroying `key.json` makes objects encrypted under that key inaccessible to Qarinah and records an erasure receipt in the ledger. It does not prove physical-media erasure, remove copied keys or plaintext, reach backups, or erase data held by another system. Old manifests remain as metadata receipts and will fail verification after their key is destroyed.

## Resource limits

Archive creation is explicitly bounded by file count, per-file bytes, total source bytes, and chunk sizes. The current implementation reads one permitted file at a time; it is suitable for source trees and bounded exports, not an unreviewed full-disk or multi-terabyte backup. Use a dedicated backup product for complete device retention.

## Relationship to the 98.7148% result

The published 98.7148% figure is a six-fixture reduction in estimated repeated model input context. It is not an archive compression ratio. The content archive preserves selected bytes; the context compiler retrieves a much smaller cited view for a specific task. Keeping those claims separate is part of Qarinah's evidence contract.
