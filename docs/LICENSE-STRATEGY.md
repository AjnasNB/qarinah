# Licensing and product ownership decision

This repository stays private, `UNLICENSED`, and non-publishable until the founder approves a counsel-reviewed model.

## Constraint

The Open Source Definition requires free redistribution and forbids restricting business or another field of endeavor. Therefore a license that says competitors may not use or commercialize the software is not an open-source license.

Primary references:

- Open Source Definition: https://opensource.org/osd
- OSI commercial-use FAQ: https://opensource.org/faq
- GNU AGPLv3: https://www.gnu.org/licenses/agpl-3.0.html
- Business Source License 1.1: https://mariadb.com/bsl11/

## Option A: genuine open source

- AGPL-3.0-only core.
- A professionally cleared context-product mark and the Maqam mark, each with a public usage policy.
- Contributor License Agreement or Developer Certificate of Origin.
- Commercial license for customers unwilling to satisfy AGPL obligations.
- Proprietary hosted control plane, enterprise connectors, certification, support, and managed policy network.

AGPL still permits compliant commercial use. Trademark law protects the product identity, not the underlying idea.

## Option B: commercial restriction

- BSL-style source-available core with an explicit additional-use grant and change date.
- Paid commercial/production licenses.
- Open protocols, SDKs, schemas, and community tools under a permissive or copyleft license.

This can restrict production/commercial use but must be described as source-available, not open source.

## Existing ecosystem

Published MIT versions of Maqam, Cockroach Crawler, and ProductLoop already grant commercial rights. Those grants cannot be retroactively withdrawn from copies already received. Future versions may adopt a different compatible strategy after dependency and contributor review.
