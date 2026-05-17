# Politics Tracker Codex

An MVP web app for tracking Daniel Lurie's announcements, promises, claims, evidence, and public results over time.

## What this MVP does

- Shows a Daniel Lurie dashboard with announcement sources, structured promises, claim-check tasks, topic summaries, progress indicators, event timelines, review queues, connector status, and SVG charts.
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

The MVP is configured for a **balanced** source strategy: official San Francisco sources plus reputable local/national reporting. It does not show fabricated progress, metric, or approval values; sections stay in a “needs verified source” state until real datasets are connected.

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

## Production workflow

`.github/workflows/ingest-daniel-lurie.yml` runs every six hours and commits refreshed `public/data/daniel-lurie-tracker.json` data back to the branch. Configure the repository secret `ANTHROPIC_API_KEY` to enable AI enrichment in that scheduled job.

## Current workflow guardrails

- `scripts/validate-data.mjs` checks that source, promise, metric, connector, timeline, and review-queue records keep the fields the UI expects.
- The dashboard now includes promise search, topic/status filters, a timeline view, connector readiness cards, and a human review queue for AI-generated findings.
- No fabricated metric, approval, or progress values are shown; empty states remain until official datasets or polling feeds are attached.

## Next steps

- Add official SF open-data metric connectors for homelessness, public safety, downtown foot traffic proxies, budgets, permitting, and transit.
- Add a review UI so humans can approve, edit, or reject extracted promises and claim verdicts.
- Connect approval polling imports or survey feeds when available.
- Add durable database storage once the source and extraction workflow stabilizes.
