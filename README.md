# pi-web

Provider-neutral external `search` and `fetch` tools for
[Pi](https://pi.dev), backed by Exa and Context7.

## Tools

```text
search — discover compact web or documentation references
fetch  — retrieve bounded content from a URL or documentation reference
```

Search routes deterministically:

```text
source=web                  → Exa
source=docs                 → Context7 (target required)
source=auto with target     → Context7
source=auto without target  → Exa
```

`search` returns compact references. `fetch` retrieves content with explicit
character bounds, cancellation, provenance, and a SHA-256 digest.

## Authentication

Set provider credentials in the process environment before starting Pi:

```sh
export EXA_API_KEY="..."
export CONTEXT7_API_KEY="ctx7sk_..." # optional; anonymous limits are supported
```

Credentials stay in the host process and are never returned in tool results.
Do not place credentials in repository files.

## Install

The package is not yet published. During development, add its local path as a
Pi package and run `/reload`.

## Current scope

- interactive Pi tools;
- direct Exa and Context7 REST APIs;
- bounded text/Markdown retrieval;
- one shared process-local `WebService`.

Deferred: delegated subagent tools, direct arbitrary HTTP extraction, browser
execution, PDFs/video, authenticated pages, persistent cache, and repository
snapshots.

## Development

```sh
npm install
npm run check
```

Supported runtime target: macOS Apple Silicon with Node.js 23.6 or newer.
Ordinary CI runs on Ubuntu as build and portability evidence only.
