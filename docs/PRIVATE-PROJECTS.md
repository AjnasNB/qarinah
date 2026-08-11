# Private and NDA projects

Qarinah is designed for projects where source code, decisions, and agent history should stay under the operator's control. It can support an NDA-conscious workflow, but the software does not create, sign, or replace a legal non-disclosure agreement.

## Data-handling controls

- Project-local storage; no hosted Qarinah memory account is required.
- Metadata-only capture by default.
- Explicit per-workspace consent before content capture.
- Machine-local trust that is not granted by cloning repository files.
- Bounded redaction and retention controls.
- Hidden reasoning, credentials, browser session state, and private model internals remain outside the capture boundary.
- Encrypted team bundles, explicit membership records, and signed checkpoints for authorized exchange.
- Exact repository, time, disclosure, freshness, and authority filters before evidence enters a context pack.

## Recommended private-project setup

```sh
npx qarinah init . --capture metadata
npx qarinah policy .
npx qarinah doctor
```

Review the proposed policy before authorizing content capture. If visible content is permitted:

```sh
npx qarinah setup . --codex --claude --cursor --capture content --allow-query
```

The project owner remains responsible for legal agreements, repository access, backups, endpoint security, host telemetry, model-provider policies, and deciding which content may be recorded or disclosed.
