# Local Qarinah or Azure-backed retrieval

Qarinah's shipped default is the right starting point for a single developer or one private project: a local hash-chained JSONL authority, a rebuildable SQLite FTS5 read model, and a typed graph. It is offline, inexpensive to operate, easy to inspect, and does not upload project memory.

Azure becomes useful when an organization needs shared remote retrieval across many repositories, managed availability, network isolation, or centrally administered access. It is an optional deployment architecture, not a default Qarinah data path.

## Decision guide

| Need | Recommended starting point |
| --- | --- |
| One workstation or repository | Local Qarinah SQLite and graph |
| Private/NDA-conscious work with no cloud approval | Local Qarinah plus encrypted/offline backup |
| A team sharing many large repositories | Evaluate Azure AI Search with an explicit sync adapter |
| Durable source-export retention | Azure Blob Storage or an operator-owned external drive; do not confuse this with the search index |
| Keyword plus semantic retrieval | Azure AI Search hybrid search, after a relevance and cost evaluation |
| Private Azure connectivity | Azure AI Search private endpoint, Microsoft Entra RBAC, and public data-plane access disabled |

Azure AI Search can run full-text and vector queries together and merge the rankings with Reciprocal Rank Fusion. Microsoft documents vector search on all tiers, while embedding generation or enrichment can add separate model costs. [Hybrid search](https://learn.microsoft.com/en-us/azure/search/hybrid-search-overview) and [vector search](https://learn.microsoft.com/en-us/azure/search/vector-search-overview) are the relevant official starting points.

For sensitive data, use Microsoft Entra role-based access instead of search API keys, enforce per-document or per-repository filters, and prefer a private endpoint when the selected tier supports it. Microsoft notes that security-filter strings are an application-enforced pattern rather than authentication by themselves. See [RBAC](https://learn.microsoft.com/en-us/azure/search/search-security-enable-roles), [security trimming](https://learn.microsoft.com/en-us/azure/search/search-security-trimming-for-azure-search), and [network access](https://learn.microsoft.com/en-us/azure/search/service-configure-firewall).

Azure Blob versioning or immutable storage can preserve source exports, but versions and retention can increase cost and some immutable policies cannot be reversed early. Review [Blob versioning](https://learn.microsoft.com/en-us/azure/storage/blobs/versioning-overview) and [immutable storage](https://learn.microsoft.com/en-us/azure/storage/blobs/immutable-storage-overview) before enabling them.

## Proposed evaluation, not an automatic upload

No current Qarinah command sends project memory to Azure. A future adapter should be accepted only after it proves:

1. explicit per-workspace opt-in and destination identity;
2. repository and authority filters applied before upload and again at query time;
3. deterministic source-event IDs and hashes retained in every search document;
4. deletion, retention, key rotation, and export procedures;
5. a private-network and Entra-authenticated deployment option;
6. matched relevance, latency, and cost results against the local SQLite baseline; and
7. no hidden transcript, credential, or reasoning ingestion.

Azure credits can fund that evaluation. They do not remove the need to measure the chosen Search tier, storage, Private Link, embedding, enrichment, egress, and retention costs in the actual subscription and region.

