# INVEST

Ranking desk for a sector cohort. Scores follow the workbook: scale, valuation, growth, and profit, with an equal-weight composite and two sensitivity schemes.

The pilot board is the thirty-name workbook (ten sectors, target plus peers). US stocks is a separate directory import. It is not scored.

Live figures come from a key you paste in the browser. The key stays in local storage and is only sent to the provider through the server. It is not stored in this repo.

```bash
npm install
npm run dev
```

## INVEST validation and feed coverage

Research enforces the USD 10bn cap floor and requires at least three comparable issuers. Add a directory company to Research or stage a pilot cohort, then review its scope, reporting periods, forward valuation inputs, historical EPS, guidance and client/partner records.

Live feed supports a one-company test, manual refresh of tracked names, cancellation, and opt-in daily refresh while the browser is open. Daily refresh is attempted at most once every 24 hours for the selected provider. Finnhub batches are paced; account limits and endpoint entitlements still apply. Changing provider clears the old provider's key.

A successful quote does not imply complete financial coverage. Endpoint errors and unavailable history are visible. Quote-only updates preserve cap provenance and financial dates. Undated financial updates invalidate Research freshness and comparability. Annual revenue growth requires a matched fiscal-year pair three years apart. Finnhub Basic Financials annual currency totals are not inferred from undocumented units; TTM revenue derived from per-share data is marked as estimated. Polygon's retired financials endpoint is disabled. Existing values survive missing fields, so the pilot can contain mixed workbook and refreshed inputs; its refresh timestamp is not a financial statement date.

Run `npm test`, `npm run typecheck` and `npm run build`. For browser checks, install Chromium with `npx playwright install chromium`, start `npm run preview:restart`, then run `node scripts/invest-browser-check.mjs`. The GitHub Actions workflow runs these checks on pull requests and main. Its auth-disabled preview is a test environment only; deployment authentication flags are unchanged. Provider tests use fixtures and do not verify a real key's coverage.
