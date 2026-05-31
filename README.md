# Politics Tracker Codex

An MVP website for tracking Daniel Lurie's announcements, promises, claims, evidence, and public San Francisco results over time.

## What this MVP does

- Shows a Daniel Lurie dashboard with announcement sources, structured promises, claim-check tasks, topic summaries, progress indicators, event timelines, Public SF connector status, and SVG charts.
- Stores the current dashboard payload in `public/data/daniel-lurie-tracker.json` so the website can render fast and transparently.
- Provides a recurring ingestion workflow that pulls Daniel Lurie sources from Google News RSS, direct local news RSS feeds, Anthropic web search, official SF pages, and Public SF/DataSF metrics, then asks Claude to enrich current claims, timeline items, and major-news selection when configured.
- Includes a GitHub Actions schedule that can refresh tracker data every six hours when repository secrets are configured.

## Vercel deployment

This project is configured for Vercel with `vercel.json`. Use:

- Build command: `npm run build`
- Output directory: `dist`
- Install command: `echo 'No package install required'`

Set these environment variables in Vercel and GitHub Actions when AI enrichment should run:

- `ANTHROPIC_API_KEY`: enables Claude enrichment.
- `ANTHROPIC_MODEL`: optional; defaults to `claude-sonnet-4-5`.

## Local development

```bash
npm run dev
```

Open the local URL printed in the terminal. The MVP uses browser-native JavaScript and has no package dependencies.

## Build and checks

```bash
npm run validate:data
npm run build
npm run ingest:refresh -- --dry-run
```

## Source policy

The MVP is configured for a **balanced** source strategy: official San Francisco sources plus reputable local/national reporting discovered through RSS, Anthropic web search, and curated public datasets. Outcome metrics use Public SF/DataSF datasets only. Approval ratings are intentionally out of scope. It does not show fabricated metric values; progress percentages appear only after a reviewed source-backed scoring decision.

## Data refresh workflow

Manual local refresh:

```bash
npm run ingest:refresh
```

Manual promise reseed:

```bash
npm run ingest:promises
```

The ingestion workflow now has two phases:

1. **Promise seed phase**: stores canonical campaign promises in `campaignPromiseSeed` plus `promiseSeedMeta`.
2. **Refresh phase**: fetches current sources and metrics, rescoring persisted campaign promises against current evidence.

The refresh script works in two modes:

1. **Without `ANTHROPIC_API_KEY`**: fetches and normalizes deterministic source records, then keeps existing structured promises and claims.
2. **With `ANTHROPIC_API_KEY`**: uses Anthropic web search for additional source discovery, sends the newest source summaries to the Anthropic Messages API, and accepts JSON enrichment for claims, timeline items, and major-news selection.

Campaign promise extraction is no longer part of the recurring six-hour refresh. It only reruns when:

- `npm run ingest:promises` is invoked, or
- the campaign source fingerprint changes.

Optional environment variables:

- `ANTHROPIC_API_KEY`: enables AI enrichment.
- `ANTHROPIC_MODEL`: overrides the model used by the ingestion job. Defaults to `claude-sonnet-4-5`.

## Promise scoring guardrails

Promise review status and evidence notes are stored directly in `public/data/daniel-lurie-tracker.json`, then checked with `npm run validate:data` before committing.

Promise scores must follow these rules:

- Set `progress` only when the source record verifies an action or milestone.
- Keep `progress` as `null` when only an announcement, claim, or unverified outcome exists.
- Use `reviewStatus: "approved"` only when the promise interpretation and progress basis have been reviewed.
- Use `reviewStatus: "needs_more_evidence"` when the promise is real but should not receive a score yet.
- Treat public metric movement as an indicator, not proof that the mayor caused the result.

## Production workflow

`.github/workflows/ingest-daniel-lurie.yml` runs `npm run ingest:refresh` every six hours and commits refreshed `public/data/daniel-lurie-tracker.json` data back to the branch. Configure the repository secret `ANTHROPIC_API_KEY` to enable AI enrichment in that scheduled job.

## Current workflow guardrails

- `scripts/validate-data.mjs` checks that source, promise, metric, connector, and timeline records keep the fields the UI expects, and rejects approval-rating data.
- The dashboard now includes promise search, topic/status filters, reviewed progress badges, source provenance, metric freshness labels, timeline coverage, connector readiness cards, and a separate charts page with on-demand AI chart generation.
- No fabricated metric or progress values are shown; empty states remain until Public SF/DataSF datasets refresh successfully.

## Next steps

- Expand Public SF/DataSF metric connectors for homelessness, public safety, budgets, permitting, transit, and other promise-linked indicators.
- Add a lightweight editing workflow so humans can approve, edit, or reject extracted promises and claim verdicts.
- Add durable database storage once the source and extraction workflow stabilizes.
