# Politics Tracker Codex

An MVP web app for tracking Daniel Lurie's announcements, promises, claims, evidence, and public results over time.

## What this MVP does

- Shows a Daniel Lurie dashboard with announcement sources, structured promises, claim-check tasks, topic summaries, progress indicators, and SVG charts.
- Stores the current dashboard payload in `public/data/daniel-lurie-tracker.json` so the website can render fast and transparently.
- Provides a recurring ingestion workflow that pulls Daniel Lurie news from Google News RSS, classifies source topics, merges/deduplicates sources, and optionally asks OpenAI to enrich promises, claims, and topic insights.
- Includes a GitHub Actions schedule that can refresh tracker data every six hours when repository secrets are configured.

## Local development

```bash
npm run dev
```

Open the local URL printed in the terminal. The MVP uses browser-native JavaScript and has no package dependencies.

## Build and checks

```bash
npm run build
npm run ingest:daniel-lurie -- --dry-run
```

## Data refresh workflow

Manual local refresh:

```bash
npm run ingest:daniel-lurie
```

The ingestion script works in two modes:

1. **Without `OPENAI_API_KEY`**: fetches and normalizes news/source records, then keeps existing structured promises and claims.
2. **With `OPENAI_API_KEY`**: sends the newest source summaries to the OpenAI Responses API and accepts JSON enrichment for promises, claims, and topic insights.

Optional environment variables:

- `OPENAI_API_KEY`: enables AI enrichment.
- `OPENAI_MODEL`: overrides the model used by the ingestion job. Defaults to `gpt-5.4-mini`.

## Production workflow

`.github/workflows/ingest-daniel-lurie.yml` runs every six hours and commits refreshed `public/data/daniel-lurie-tracker.json` data back to the branch. Configure the repository secret `OPENAI_API_KEY` to enable AI enrichment in that scheduled job.

## Next steps

- Add official SF open-data metric connectors for homelessness, public safety, downtown foot traffic proxies, budgets, permitting, and transit.
- Add a review UI so humans can approve, edit, or reject extracted promises and claim verdicts.
- Replace placeholder approval data with polling imports or survey feeds when available.
- Add durable database storage once the source and extraction workflow stabilizes.
