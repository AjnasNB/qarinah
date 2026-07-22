# Governed agent stack: public release and launch plan

Last verified: 2026-07-22.

This is the coordinated public plan for Qarinah, Maqam, Cockroach Crawler, and ProductLoop. The products keep separate repositories, packages, contracts, ledgers, and release versions. Publicly, they tell one useful story:

> Research, remember, act, and prove what happened - through explicit boundaries.

## Launch decision

Do not run four same-week launches. Launch one working end-to-end system, then use focused follow-ups to explain the component that solved each part.

- **Qarinah remembers:** permitted events, decisions, sources, conflicts, and project structure become small cited context packs.
- **Maqam governs:** registered tool calls pass policy and exact input-bound, one-use approval before dispatch.
- **Cockroach Crawler gathers:** bounded public-source records enter through explicit provider and network policies.
- **ProductLoop orchestrates:** workflows connect the packages without silently merging their contracts or ledgers.

Qarinah is the new launch wedge. Maqam is the trust boundary. The crawler and ProductLoop make the proof concrete. The long-term product may become a cross-platform agent control plane, but the current public claim is a governed developer stack, not an agentic operating system.

## Verified release state

Re-check registries and repositories immediately before publishing. As of the date above:

| Product | Public state | Launch treatment |
| --- | --- | --- |
| Maqam | `0.3.2` is the stable GitHub and npm release | Ready for demos that use only documented guarantees |
| ProductLoop | `0.2.3` is the stable GitHub and npm release | Present as orchestration, not a second flagship launch |
| Cockroach Crawler | `0.3.0` is the stable GitHub and npm `latest` release | Ready for bounded-crawl, provider-routing, optional reach, browser-host, and restricted serverless demos within documented limits |
| Qarinah | `0.1.0-alpha.3` is an unpublished candidate in a private repository | Do not announce, tag, or publish until every gate in [LAUNCH.md](LAUNCH.md) is complete |

Never describe a local version, candidate, or prerelease as the latest stable release.

## Message hierarchy

### Brand line

> **Less context. More proof.**

This is the repeatable Qarinah tagline. It is short enough for GitHub, npm, the website, video end cards, and social profiles.

### Current proof line

> **98.71% fewer estimated context tokens than full-history replay across six committed software-task fixtures.**

Keep the direct details beside the number: 240 retained records; identical current-task source snippets on both sides; full-history replay versus cited Qarinah packs; 442,113 versus 5,682 estimated tokens; every target in the top five with direct coverage; zero model-written summary items; `ceil(characters / 4)` estimate rather than provider billing.

### Claim that is not yet approved

Do not shorten the result to "90% fewer tokens in Codex and Claude," "90% lower AI cost," or an equivalent provider claim. The software-task benchmark supports a 98.71% estimated-context reduction against its named full-history baseline, not provider billing or provider-native token accounting.

Promote a provider claim only after a committed evaluator:

1. defines at least 20 representative, versioned software tasks before measurement;
2. compares the same model, host, system instructions, tools, repository commit, and expected evidence with and without Qarinah;
3. uses provider-native input-token fields rather than `characters / 4`;
4. records completeness, task success, unsupported-answer rate, latency, and cost as separate outcomes;
5. includes cold and warm runs and publishes per-case results, exclusions, environment, and confidence intervals; and
6. survives clean reproduction by someone other than the author.

If the result is at least 90%, the approved wording should remain scoped, for example: "90.4% fewer input tokens across our 20-task Codex CLI fixture on [model/version/date]." Do not turn one host result into a universal Codex-and-Claude claim.

## The single launch proof

Build one 60-90 second terminal-led demo against public release artifacts:

1. Cockroach Crawler reads one permitted public source and returns a bounded source record.
2. Qarinah records the source and one explicit project decision, scans the project, and builds its verified projections.
3. Maqam blocks a consequential registered write with `APPROVAL_REQUIRED`.
4. The user approves the exact run, tool, and input once; changed input and approval replay both fail.
5. ProductLoop completes the workflow and links its receipt to the recorded evidence.
6. A fresh Codex or Claude Code task asks for the decision and receives a small pack with event IDs and hashes instead of the entire project history.

The demo must use deterministic fixtures or safe temporary files. Show real terminal output. State that direct operating-system calls outside registered adapters are not governed.

Acceptance evidence:

- exact public versions and commit SHAs;
- clean install on Node 22, 24, and 26;
- commands, fixture, expected output, transcript, captions, and checksum;
- denial, mismatch, one-use success, replay rejection, and Qarinah `doctor` output;
- no secrets, private paths, browser cookies, private sources, or invented screenshots; and
- one copy-paste reproduction path that takes less than five minutes.

## Release sequence

### Phase 0 - freeze and prove

1. Finish Qarinah's name, copyright, third-party, privacy, threat-model, and complete Git-history secret reviews.
2. Freeze one integration-demo manifest containing every package version, repository SHA, Node version, fixture hash, and command.
3. Run each repository's complete check from a clean install. Keep Qarinah's prerelease label visible.
4. Run a fresh-consumer install and the end-to-end demo on Windows, macOS, and Linux where the claim requires those platforms.
5. Cut the demo only from the verified outputs and exact candidate artifacts.

### Phase 1 - source, packages, and releases

1. Make Qarinah public only after the secret and legal gates pass. Public visibility is required if npm provenance should point to a public source repository.
2. Configure [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) for the exact GitHub workflow and protected release environment.
3. Stage Qarinah `0.1.0-alpha.3`, inspect the registry artifact, install it into a clean consumer, and approve the exact identity.
4. Publish Qarinah under npm `next`, create the matching prerelease tag and [GitHub release](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) at the same commit, and verify provenance, integrity, package contents, links, and plugin installation.
5. Do not republish Maqam or ProductLoop merely to synchronize dates. Reference their current stable releases unless code actually changed.
6. Use Cockroach Crawler `0.3.0` from `latest`; do not revive prerelease install commands in current launch copy.

For every package, the release record must bind name, version, registry, dist-tag, commit, tarball SHA-256, npm integrity, packed files, workflow run, and approver.

### Phase 2 - developer launch

Ship the public repository/npm proof first. Then publish one Show HN submission for the runnable governed-stack demo, with Qarinah as the new capability and Maqam as the control boundary.

[Hacker News currently asks](https://news.ycombinator.com/newsguidelines.html) authors not to post generated or AI-edited text. The maintainer must write the final title, submission, and comments personally. Use these only as facts to express in your own words:

- you built it because replaying project history is noisy and opaque summaries are hard to verify;
- Qarinah compiles small cited packs from a local hash-chained record;
- the demo combines bounded research, memory, exact approval, and workflow receipts;
- the current benchmark is a fixture-level character-volume result, not a universal token claim; and
- the biggest open questions are external reproduction, retrieval quality on larger projects, and the first production adapter.

The [Show HN submission](https://news.ycombinator.com/showhn.html) must point to something people can run without a signup wall. The title begins with `Show HN:`. Be available for the discussion, do not coordinate votes, and do not delete/repost to chase ranking.

### Phase 3 - technical distribution

During the next seven days, publish different useful artifacts rather than the same promotional paragraph:

| Audience | Useful artifact | Request |
| --- | --- | --- |
| Node.js and TypeScript developers | Five-minute governed-tool example | Reproduce install and type failures |
| AI-agent builders | Qarinah context-pack fixture and host adapters | Test one real project and report missing evidence |
| Application security | Exact approval mutation/replay suite and threat boundaries | Review a specific control or bypass |
| Open-source maintainers | Deterministic Markdown/OKF record and rebuild proof | Review portability and contribution workflow |
| Crawler/browser engineers | Bounded source-record contract and provider doctor | Reproduce provider/network edge cases |

Use the repository Discussion or a clearly labeled issue template for results. Disclose that you maintain the project. Never mass-DM, automate replies, buy votes, or ask people to star before trying it.

### Phase 4 - Product Hunt

Wait until the public install has been completed by external users, the website and video work on mobile, and recurring objections have documented answers. Post one product, not four; [Product Hunt advises](https://help.producthunt.com/en/articles/484934-can-i-relaunch-my-product) makers with several products in a short period to combine them.

Suggested draft fields, which the maintainer should verify before posting:

- **Name:** Qarinah
- **Tagline:** Less context. More proof.
- **Description:** Local-first agent memory that turns permitted project activity into small, cited context packs. Works with Codex and Claude Code, keeps an inspectable event chain, and composes with Maqam governance, bounded research, and ProductLoop workflows.
- **Topics:** Developer Tools, Artificial Intelligence, Open Source
- **Pricing:** Free
- **Primary URL:** the live product/docs page, not an article

Prepare a 240x240 mark, at least three 1270x760 gallery images, a public YouTube demo, the architecture picture, the benchmark-method card, and a first maker comment that explains the problem, boundary, and what feedback is needed. These sizes and fields follow Product Hunt's current [posting guide](https://help.producthunt.com/en/articles/479557-how-to-post-a-product). Create a draft first and schedule only when every link works.

### Phase 5 - YC application

Apply with one company story, not four package descriptions. The concise pitch is:

> We are building the governance and memory control plane for AI agents. It gives teams exact action approvals, source-linked evidence, and compact verified context across agent hosts and workflow runtimes.

Describe the current wedge as developer infrastructure for governing consequential agent tools and retaining trustworthy project context. Describe the longer path as cross-platform mediation only as a roadmap, with explicit acknowledgement that full operating-system control requires separately reviewed process, filesystem, network, identity, secret, and device boundaries.

Before submitting, collect:

- a 60-second founder video that shows the working demo;
- current npm installs/downloads with dates and caveats;
- count of independent users who completed the example;
- activated projects and repeat users, not only stars;
- three strongest user quotes or concrete requested workflows;
- the hardest technical insight: approval must bind exact executable input, and useful memory must preserve evidence separately from compiled context; and
- the next milestone and why this team can ship it.

The [Fall 2026 on-time YC deadline](https://www.ycombinator.com/apply) is July 27, 2026 at 8 p.m. Pacific Time. Submit the truthful working version before the deadline and update traction afterward; do not wait for Product Hunt.

## Public adoption system

### Contribution surface

Open a small set of outcome-based issues after the releases are public:

1. reproduce the Qarinah fixture on Node 22, 24, and 26;
2. add a held-out real-project context case with sanitized evidence;
3. implement one strict host adapter with malformed-input fixtures;
4. test Maqam-backed disclosure denial and exact approval consumption;
5. validate a crawler provider against redirect, SSRF, robots, and budget boundaries; and
6. reproduce the complete demo from only public artifacts.

Each issue needs an acceptance test, security boundary, expected artifact, supported platform, and maintainer contact. Label only genuinely bounded work as `good first issue`.

### Case studies

Publish evidence, not testimonials without a method. Each case study should report:

- project type and retained-record size;
- exact task, baseline, query, context budget, and model/host version;
- selected evidence and missing evidence;
- provider-native input tokens if making a token claim;
- task success and any unsupported answer;
- setup time and time to first useful pack; and
- permission to publish the user's name or an explicit anonymization statement.

### Metrics

Record a baseline immediately before launch, then snapshots at 24 hours, 7 days, and 30 days:

| Funnel | Measure | First 30-day learning target |
| --- | --- | --- |
| Reach | Qualified repository visits and demo views | Identify which channel reaches builders |
| Evaluation | Clean installs and demo starts | 20 independent starts |
| Activation | Successful first cited pack plus governed action | 10 independent completions |
| Retention | A second task or project within 14 days | 5 returning users |
| Depth | A real adapter, case study, or production-shaped workflow | 3 concrete workflows |
| Community | External issues, reproductions, and merged contributions | 3 substantive contributors |
| Quality | Install failures, unsafe behavior, false/missing retrieval, response time | Triage every reproducible defect |

Stars and raw npm downloads are supporting reach signals, not proof of product value.

## Founder operating schedule

### Next 72 hours

- finish the Qarinah release gates and the one-command public-artifact demo;
- record the compact demo and founder video;
- prepare the YC application around the single control-plane thesis;
- recruit three independent developers for clean-room reproduction; and
- create Product Hunt drafts but do not schedule them.

### First 14 public days

- day 0: GitHub/npm/prerelease verification;
- day 1: personally authored Show HN submission and live technical support;
- days 2-3: fix onboarding failures and publish corrections;
- days 4-7: one technical article and targeted, rule-compliant community discussions;
- days 8-14: external case studies, provider-native token evaluator, and Product Hunt readiness review.

### Days 15-30

- launch Product Hunt only if activation and support readiness are real;
- ship the most requested strict adapter or reliability fix;
- publish the first independently reproducible case study; and
- choose the next product investment from activation and retention evidence.

## Stop conditions

Pause distribution when a release identity does not match, a secret or private record is exposed, provenance is missing, a security boundary is misstated, the demo cannot be reproduced from public artifacts, or critical install/retrieval failures remain untriaged. Fix the product and evidence before increasing reach.
