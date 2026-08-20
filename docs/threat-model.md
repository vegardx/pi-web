# Threat model

The primary threat is accidental destructive or inconsistent behavior from
untrusted external content and overly broad network retrieval.

## Controls

- only fixed Exa and Context7 API origins are contacted in the initial slice;
- provider redirects are refused so credentials cannot cross origins;
- arbitrary fetched URLs are retrieved by Exa, not directly by the host, and
  URL userinfo is rejected;
- credentials remain in request headers and are redacted from provider errors
  and successful provider data;
- request bodies, provider responses, result counts, strings, and model-visible
  output are bounded;
- caller cancellation and a timeout abort provider requests;
- fetched content is labelled untrusted and never becomes a system instruction;
- no browser, JavaScript execution, authenticated/private page access, host Git,
  cache, or local-file URL is supported.

The service does not claim confidentiality from public providers: queries and
requested URLs are sent to Exa or Context7 as selected by the caller.
