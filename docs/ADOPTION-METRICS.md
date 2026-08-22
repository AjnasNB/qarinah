# Adoption measurement

Qarinah distinguishes package activity from successful use. npm downloads, Git clones, repository views, and stars are discovery signals. They do not prove that a developer completed setup, retrieved useful context, resumed a second session, or returned later.

## Initial activation funnel

The first design-partner cycle uses these explicit targets:

| Stage | Target | Evidence |
| --- | ---: | --- |
| Qualified landing-page visitors | 100 | Website analytics filtered to the Qarinah project-memory workflow |
| Successful setups | 30 | Once-only opt-in `setup_completed` milestones and support receipts |
| First useful retrievals | 15 | Once-only opt-in `first_retrieval` milestones plus user-confirmed usefulness |
| Fresh-session handoffs | 8 | Once-only opt-in `first_cross_session_handoff` milestones plus the handoff protocol |
| Seven-day returning installations | 5 | Once-only opt-in `seven_day_return` milestones |
| Publishable user outcomes | 3 | Quotes approved by the named developer with a reproducible before/after workflow |

The activation dataset contains no project content. Read [Privacy](../PRIVACY.md#optional-content-free-activation-measurement) for the exact payload boundary.

## Read the funnel

The production Worker writes one data point per once-only milestone to the `qarinah_activation` Analytics Engine dataset. The installation UUID is the sampling index, and the event name is `blob1`. Use an Account Analytics Read token locally; never commit the token:

```powershell
$env:CLOUDFLARE_ACCOUNT_ID = "your-32-character-account-id"
$env:CLOUDFLARE_API_TOKEN = "your-read-only-token"
$env:QARINAH_QUALIFIED_VISITORS = "100"
$env:QARINAH_PUBLIC_TESTIMONIALS = "3"
npm run adoption:funnel
```

The script counts distinct installation indexes for each milestone and calculates setup, retrieval, handoff, and return conversion. Qualified visitors come from the website's first-party Cloudflare traffic report; testimonials remain a manually verified count because a quote must never be inferred from telemetry.

## What counts as a testimonial

A testimonial is never generated from a download, benchmark, maintainer statement, or anonymous metric. It requires a real user to approve the wording and public attribution. Capture:

1. the coding agents and repository type used;
2. the old handoff process;
3. whether Qarinah recovered an agreed decision in a fresh session;
4. the time or context avoided, when the user measured it;
5. the exact quote and attribution the user approved.

## Design-partner workflow

The first ten maintainers receive a short setup call or asynchronous walkthrough, use the isolated demo first, initialize one project with the minimum permissions they choose, perform one fresh-session handoff, and report any missing or misleading evidence. File product defects separately from onboarding questions.

Use the [design-partner intake](https://github.com/AjnasNB/qarinah/issues/new?template=design_partner.yml) to join. Do not include repository secrets or private project content in the issue.
