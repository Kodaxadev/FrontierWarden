---
name: Integration Request / Tool Builder Support
about: You're building an EVE Frontier tool on top of FrontierWarden and need API support, SDK help, or a new integration target
title: "[INTEGRATION] "
labels: integration
assignees: Kodaxadev
---

> Before opening this issue, please read:
> - `Documents/INTEGRATION_GUIDE.md` — builder quickstart
> - `Documents/TRUST_API.md` — full Trust API contract
> - `Documents/KILLMAIL_API.md` — killmail endpoints

## Your Tool / Use Case

<!-- What are you building? What does it do for EVE Frontier players or operators?
Examples: gate access tool, bounty board, lending UI, tribe standing dashboard, logistics system -->

## Integration Target

<!-- Which FrontierWarden surface are you integrating with? -->

- [ ] `POST /v1/trust/evaluate` — core trust decision endpoint
- [ ] Killmail API (`/v1/killmails/*`)
- [ ] TypeScript SDK (TrustKit — `sdk/trustkit`)
- [ ] Gate policy / `reputation_gate.move`
- [ ] Attestation / schema query
- [ ] Other: 

## What You Need

<!-- Describe the specific support you need:
- A new API endpoint or parameter?
- SDK method that doesn't exist yet?
- Clarification on trust decision proof bundle format?
- Gate binding or operator flow help?
- Testnet access or Stillness environment info? -->

## Current Approach

<!-- What have you tried so far? Paste relevant code, request/response payloads, or SDK usage if applicable -->

```json

```

## Blocker or Question

<!-- What specifically is blocked or unclear? -->

## Additional Context

<!-- Your tool's stack, target player base, tribe affiliation, or any other relevant context -->

---
> FrontierWarden is pre-mainnet on Sui Stillness testnet. Commercial integrations require a separate license. Contact: Justin.DavisWE@icloud.com
