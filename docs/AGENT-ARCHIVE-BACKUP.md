# External agent-archive backup

Qarinah can copy an explicitly selected Codex, Claude, or portable JSONL/NDJSON export to an operator-selected external directory while it initializes a project. The copy is streamed, bounded, hashed, and accompanied by a manifest. Qarinah records only a compact receipt in the project ledger.

It does not silently search a home directory, copy a live private transcript store, discover removable drives, upload an archive, or retain hidden reasoning. Export and destination selection remain deliberate operator actions.

## Back up during setup

Create the external destination directory first, then run:

```sh
npx qarinah setup . \
  --codex \
  --backup-source "/absolute/path/to/exported-codex-jsonl" \
  --backup-destination "/absolute/path/on/external-drive/qarinah-backups"
```

On Windows, use absolute drive paths:

```powershell
npx qarinah setup . `
  --codex `
  --backup-source "C:\exports\codex-jsonl" `
  --backup-destination "E:\qarinah-backups"
```

Setup initializes SQLite, the relationship graph, readable records, the dashboard, and the requested host integration. It then creates a uniquely named directory inside the external destination.

## Back up an initialized project later

```sh
npx qarinah backup /absolute/export/one /absolute/export/two \
  --destination /absolute/external/qarinah-backups \
  --max-files 100000 \
  --max-bytes 107374182400
```

The CLI accepts multiple source paths. The JavaScript API accepts from 1 to 32 sources.

## What is written

```text
qarinah-agent-archive-<timestamp>-<source-digest>/
├── source-1/
│   └── ... copied JSONL and NDJSON files
├── source-2/
│   └── ... copied JSONL and NDJSON files
└── manifest.json
```

The manifest records relative file names, byte counts, SHA-256 digests, source identifiers, total files, total bytes, and a manifest hash. The project ledger receipt records counts, the manifest hash, and the generated backup-directory name—not the private absolute source path.

## Safety boundary

- Sources and destination must be explicit absolute paths.
- The external destination directory must already exist.
- Source and destination cannot contain one another.
- Symbolic links, junctions, hard-linked source files, non-files, and unsupported extensions are rejected.
- Only `.jsonl` and `.ndjson` files are copied.
- The source is measured before copying and metered again while streaming.
- A changed or oversized source fails closed and removes the incomplete backup directory.
- Defaults are 100 GiB total and 100,000 files; lower limits can be supplied.

This backup preserves exported source bytes. It is separate from Qarinah's compact model-facing context pack. A multi-gigabyte archive does not become a lossless few-kilobyte file; Qarinah retains searchable project memory and sends a small, relevant, cited subset to an agent for each task.
