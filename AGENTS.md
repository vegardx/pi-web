# AGENTS.md

`pi-web` is the standalone owner of provider-neutral external search and fetch
for Pi. It calls Exa and Context7 directly and exposes one shared host-side
service. It does not own delegated execution, workflows, publication, browser
automation, or authenticated/private page access.

## Build / check

- `npm run check` — full gate: Biome, TypeScript, Vitest, build, pack smoke.
- `npm test` — unit and integration tests.
- `npm run lint:fix` — format and lint fixes.

## Boundaries

- Never read or write `.env` files.
- Credentials remain host-side and never appear in tool results or errors.
- Propagate cancellation and enforce response, output, timeout, and redirect
  bounds before returning provider data.
- Search discovers compact references; fetch retrieves bounded content.
- No implicit provider fallback or keyword-based routing.
- Tool names, schemas, implementation, descriptions, and grants have one
  declaration source and fail on collisions.
- Imports use explicit `.js` extensions. Tabs, double quotes, strict TypeScript.
