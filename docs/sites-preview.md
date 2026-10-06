# Sites preview deployment

The default `npm run build` continues to target Vercel.

`npm run build:sites` opts into Nitro's module Worker preset and writes:

- `dist/server/index.mjs`: generated Nitro Worker.
- `dist/server/index.js`: the Sites entrypoint re-export.
- `dist/client/`: generated public assets.

The Sites build does not run the PostgreSQL migrator. It preserves the shared
app-environment wrapper and invokes Vite through Node so the build also works
on Windows.

## Publish

1. Install the locked dependencies and run `npm run typecheck` and
   `npm run build:sites`.
2. Read the Sites hosting skill in the publishing workspace.
3. Reuse `.openai/hosting.json`'s project ID if present. Otherwise register this
   app through Sites and write the exact returned ID into that manifest.
   Do not invent an ID or copy one from a different app.
4. Use the bundled Sites source workflow in this checkout to push the exact
   source, run the Sites build, and package the output.
5. Save and deploy through the native Sites connector, preserving private access.
6. Confirm a successful deployment response before reporting a URL.

This build command does not provision a Site, synchronize its source repository,
or publish it. A successful build alone does not verify Worker execution, page
rendering, API access, or stock-scoring correctness. Verify those in preview.

Do not commit API keys or provider credentials. Existing provider access still
depends on the user's key and plan.
