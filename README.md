# Politics Tracker Codex

An MVP web app for tracking Daniel Lurie's announcements, promises, claims, evidence, and public San Francisco results over time.

## What this MVP does

- Shows a Daniel Lurie dashboard with announcement sources, structured promises, claim-check tasks, topic summaries, progress indicators, event timelines, review queues, Public SF connector status, and SVG charts.
- Stores the current dashboard payload in `public/data/daniel-lurie-tracker.json` so the website can render fast and transparently.
- Provides a recurring ingestion workflow that pulls Daniel Lurie news from Google News RSS, classifies source topics, merges/deduplicates sources, and optionally asks Anthropic Claude to enrich promises, claims, and topic insights.
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
npm run ingest:daniel-lurie -- --dry-run
```

## Source policy

The MVP is configured for a **balanced** source strategy: official San Francisco sources plus reputable local/national reporting. Outcome metrics use Public SF/DataSF datasets only. Approval ratings are intentionally out of scope. It does not show fabricated progress or metric values; sections stay in a “needs verified source” state until real datasets are connected.

## Data refresh workflow

Manual local refresh:

```bash
npm run ingest:daniel-lurie
```

The ingestion script works in two modes:

1. **Without `ANTHROPIC_API_KEY`**: fetches and normalizes news/source records, then keeps existing structured promises and claims.
2. **With `ANTHROPIC_API_KEY`**: sends the newest source summaries to the Anthropic Messages API and accepts JSON enrichment for promises, claims, timeline items, review tasks, and topic insights.

Optional environment variables:

- `ANTHROPIC_API_KEY`: enables AI enrichment.
- `ANTHROPIC_MODEL`: overrides the model used by the ingestion job. Defaults to `claude-sonnet-4-5`.

## JSON-based review

The MVP review workflow is JSON-based. Update review statuses and evidence notes directly in `public/data/daniel-lurie-tracker.json`, then run `npm run validate:data` before committing.

## After Vercel deployment

Since Vercel and Anthropic secrets are configured, manually run the GitHub Actions workflow once from the Actions tab. The workflow will refresh Google News sources, query the three Public SF datasets over the internet, optionally enrich with Anthropic, and commit the refreshed JSON payload.

## Production workflow

`.github/workflows/ingest-daniel-lurie.yml` runs every six hours and commits refreshed `public/data/daniel-lurie-tracker.json` data back to the branch. Configure the repository secret `ANTHROPIC_API_KEY` to enable AI enrichment in that scheduled job.

## Current workflow guardrails

- `scripts/validate-data.mjs` checks that source, promise, metric, connector, timeline, and review-queue records keep the fields the UI expects, requires metrics to use `https://data.sfgov.org/resource/...` internet dataset endpoints, and rejects approval-rating data.
- The dashboard now includes promise search, topic/status filters, a timeline view, connector readiness cards, and a human review queue for AI-generated findings.
- No fabricated metric or progress values are shown; empty states remain until Public SF/DataSF datasets refresh successfully.
- The first three MVP metrics are internet-backed Public SF datasets: SF311 cases (`vw6y-z8j6`), SFPD incident reports (`wg3w-h783`), and building permits (`i98e-djp9`).

## Next steps

- Expand Public SF/DataSF metric connectors for homelessness, public safety, budgets, permitting, transit, and other promise-linked indicators.
- Add a review UI so humans can approve, edit, or reject extracted promises and claim verdicts.
- Add durable database storage once the source and extraction workflow stabilizes.
