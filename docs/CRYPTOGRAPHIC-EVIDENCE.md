# Cryptographic evidence you can inspect

Qarinah uses SHA-256 with canonical JSON, not a proprietary hash. Event IDs identify records; hashes bind their bytes. The exact implementation lives in [canonical.js](../src/canonical.js) and [contracts.js](../src/contracts.js).

| Value | What is hashed | What it establishes |
| --- | --- | --- |
| `provenance.contentHash` | Canonical redacted event content | Identity of the retained content |
| `hash` | Canonical event envelope without its own `hash` field | Identity of the record, including its `previousHash` |
| `previousHash` | The preceding record's digest | Ordered continuity of the JSONL chain |
| Context/proof manifest | The contract-defined packet without its manifest digest | Reproducible identity of selected context and its citations |
| File SHA-256 | Exact scanned or reconstructed file bytes | Source identity and exact-byte recovery checks |

Canonical JSON sorts object keys recursively, preserves array order, and rejects unsupported JSON values. The previous hash is already inside the event envelope. It is not concatenated a second time. `qarinah doctor` verifies the chain against the machine-local checkpoint; the checkpoint helps detect replacement with an older valid prefix.

For an elementary independent SHA-256 check:

```sh
node --input-type=module -e "import {createHash} from 'node:crypto'; console.log(createHash('sha256').update('abc').digest('hex'))"
# ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
```

For real project evidence, record one permitted decision, query it, and inspect its returned `eventId`, `hash`, and `provenance.contentHash`. Run `qarinah doctor` to verify the ledger. Use `qarinah proof "your task"` for a budgeted packet carrying selected event, file, symbol, and fact identities.

A matching hash establishes byte integrity relative to the trusted inputs. It does not prove that a stored claim is true, create approval, or prevent an attacker who controls both the ledger and the machine trust state from replacing them. Optional signed checkpoints have a separate trust contract; ordinary event hashes are not signatures.

## Portable OKF evidence

OKF means **Open Knowledge Format**. `qarinah export okf` emits deterministic OKF 0.1 Draft Markdown: a root index, chronological log, event concept files, typed relations, citations, content hashes, and chain hashes. The same admitted ledger head produces the same bundle bytes. Qarinah's JSONL ledger remains authoritative; OKF is a rebuildable interchange view. See [interoperability](INTEROPERABILITY.md).
