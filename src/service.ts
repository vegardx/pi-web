import { createHash } from "node:crypto";
import { Value } from "typebox/value";
import {
	type FetchRequest,
	FetchRequestSchema,
	type FetchResponse,
	FetchResponseSchema,
	type SearchRequest,
	SearchRequestSchema,
	type SearchResponse,
	SearchResponseSchema,
	WEB_RUNTIME_CONTRACT,
	type WebRuntimeContract,
} from "./contracts.js";
import { type FetchLike, WebProviderError } from "./http.js";
import { Context7Client, parseContext7Ref } from "./providers/context7.js";
import { ExaClient } from "./providers/exa.js";

const DEFAULT_FETCH_CHARACTERS = 20_000;

export interface WebOwner {
	readonly id: string;
}

export interface WebServiceOptions {
	exaApiKey?: string;
	context7ApiKey?: string;
	fetch?: FetchLike;
}

export interface WebService {
	readonly contract: WebRuntimeContract;
	search(
		owner: WebOwner,
		request: SearchRequest,
		signal?: AbortSignal,
	): Promise<SearchResponse>;
	fetch(
		owner: WebOwner,
		request: FetchRequest,
		signal?: AbortSignal,
	): Promise<FetchResponse>;
}

function assertOwner(owner: WebOwner): void {
	if (!owner.id.trim() || Buffer.byteLength(owner.id) > 256) {
		throw new Error("invalid web service owner");
	}
}

function assertDate(value: string | undefined): void {
	if (value === undefined) return;
	if (!Number.isFinite(Date.parse(value))) {
		throw new Error("publishedAfter must be an ISO-compatible date");
	}
}

function canonicalUrl(value: string): string {
	const url = new URL(value);
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error("fetch ref must be an HTTP(S) URL or Context7 reference");
	}
	if (url.username || url.password) {
		throw new Error("fetch URL must not contain embedded credentials");
	}
	url.hash = "";
	return url.toString();
}

function truncateCodePoints(
	value: string,
	maximum: number,
): { content: string; truncated: boolean } {
	const codePoints = Array.from(value);
	if (codePoints.length <= maximum) {
		return { content: value, truncated: false };
	}
	return { content: codePoints.slice(0, maximum).join(""), truncated: true };
}

function redactSecrets<T>(value: T, secrets: readonly string[]): T {
	const redact = (entry: unknown): unknown => {
		if (typeof entry === "string") {
			return secrets.reduce(
				(result, secret) => result.replaceAll(secret, "[REDACTED]"),
				entry,
			);
		}
		if (Array.isArray(entry)) return entry.map(redact);
		if (typeof entry !== "object" || entry === null) return entry;
		return Object.fromEntries(
			Object.entries(entry).map(([key, child]) => [key, redact(child)]),
		);
	};
	return redact(value) as T;
}

async function withRedactedErrors<T>(
	operation: () => Promise<T>,
	secrets: readonly string[],
): Promise<T> {
	try {
		return await operation();
	} catch (error) {
		if (error instanceof WebProviderError) {
			throw new WebProviderError(
				error.provider,
				redactSecrets(error.message, secrets),
				error.status,
				error.requestId ? redactSecrets(error.requestId, secrets) : undefined,
				error.retryAfter ? redactSecrets(error.retryAfter, secrets) : undefined,
			);
		}
		const message = redactSecrets(
			error instanceof Error ? error.message : String(error),
			secrets,
		);
		const safe = new Error(message);
		if (error instanceof Error) safe.name = error.name;
		throw safe;
	}
}

function freezeJson<T>(value: T): T {
	const clone = JSON.parse(JSON.stringify(value)) as T;
	const freeze = (entry: unknown): void => {
		if (typeof entry !== "object" || entry === null || Object.isFrozen(entry)) {
			return;
		}
		for (const child of Object.values(entry)) freeze(child);
		Object.freeze(entry);
	};
	freeze(clone);
	return clone;
}

export function createWebService(options: WebServiceOptions = {}): WebService {
	const secrets = [
		options.exaApiKey?.trim(),
		options.context7ApiKey?.trim(),
	].filter((value): value is string => Boolean(value));
	const exa = new ExaClient({
		...(options.exaApiKey ? { apiKey: options.exaApiKey } : {}),
		...(options.fetch ? { fetch: options.fetch } : {}),
	});
	const context7 = new Context7Client({
		...(options.context7ApiKey ? { apiKey: options.context7ApiKey } : {}),
		...(options.fetch ? { fetch: options.fetch } : {}),
	});

	return {
		contract: WEB_RUNTIME_CONTRACT,
		async search(owner, request, signal) {
			assertOwner(owner);
			if (!Value.Check(SearchRequestSchema, request)) {
				throw new Error("invalid search request");
			}
			assertDate(request.publishedAfter);
			const source = request.source ?? "auto";
			const useDocs =
				source === "docs" || (source === "auto" && !!request.target);
			if (source === "web" && request.target) {
				throw new Error("target is only supported for documentation search");
			}
			if (useDocs && (request.includeDomains || request.excludeDomains)) {
				throw new Error("domain filters are only supported for web search");
			}
			if (useDocs && request.publishedAfter) {
				throw new Error("publishedAfter is only supported for web search");
			}
			const response = redactSecrets(
				await withRedactedErrors(
					() =>
						useDocs
							? context7.search(request, signal)
							: exa.search(request, signal),
					secrets,
				),
				secrets,
			);
			if (!Value.Check(SearchResponseSchema, response)) {
				throw new Error(
					"provider returned an invalid normalized search response",
				);
			}
			return freezeJson(response);
		},
		async fetch(owner, request, signal) {
			assertOwner(owner);
			if (!Value.Check(FetchRequestSchema, request)) {
				throw new Error("invalid fetch request");
			}
			const maximum = request.maxCharacters ?? DEFAULT_FETCH_CHARACTERS;
			const libraryId = parseContext7Ref(request.ref);
			if (libraryId && request.freshness) {
				throw new Error("freshness is only supported for URL fetches");
			}
			const raw = await withRedactedErrors(
				() =>
					libraryId
						? context7.fetchContext(request, libraryId, signal)
						: exa.fetchContent(
								request,
								canonicalUrl(request.ref),
								maximum,
								signal,
							),
				secrets,
			);
			const { providerTruncated = false, ...normalized } = redactSecrets(
				raw,
				secrets,
			) as typeof raw & {
				providerTruncated?: boolean;
			};
			const limited = truncateCodePoints(normalized.content, maximum);
			const response: FetchResponse = {
				...normalized,
				content: limited.content,
				sha256: createHash("sha256").update(limited.content).digest("hex"),
				bytes: Buffer.byteLength(limited.content),
				truncated: limited.truncated || providerTruncated,
				totalCharacters:
					normalized.totalCharacters ?? Array.from(normalized.content).length,
			};
			if (!Value.Check(FetchResponseSchema, response)) {
				throw new Error(
					"provider returned an invalid normalized fetch response",
				);
			}
			return freezeJson(response);
		},
	};
}
