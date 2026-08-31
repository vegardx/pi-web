# Contracts

## Search

```ts
search({
  query: string,
  source?: "auto" | "web" | "docs",
  target?: string,
  limit?: number,
  includeDomains?: string[],
  excludeDomains?: string[],
  publishedAfter?: string,
});
```

Documentation search requires `target`. Domain and publication filters apply
only to web search. Results contain provider, kind, compact snippet, and a fetch
reference.

## Fetch

```ts
fetch({
  ref: string,
  query?: string,
  maxCharacters?: number,
  freshness?: "cached" | "fallback" | "fresh",
});
```

Context7 references require a focused query. Generic clients may send
`freshness`, but it has no effect on Context7 documentation. URL references use
Exa contents retrieval: `cached` uses Exa's cache only, `fallback` prefers Exa's
cache and crawls when absent, and `fresh` requests a live crawl. The default
character limit is 20,000 and the hard limit is 50,000. Fetched content is
external untrusted source material.

## Provider boundary

Exa requires `EXA_API_KEY`. Context7 accepts anonymous IP-limited access and
optionally `CONTEXT7_API_KEY`. Base URLs and arbitrary headers are not
model-controlled.
