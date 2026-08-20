import type {
	FetchRequest,
	FetchResponse,
	SearchRequest,
	SearchResponse,
	SearchResult,
} from "../contracts.js";
import {
	type FetchLike,
	providerError,
	readResponseJson,
	readResponseText,
	requestSignal,
	WebProviderError,
} from "../http.js";

const CONTEXT7_BASE_URL = "https://context7.com/api";
const CONTEXT7_REF_PREFIX = "context7:library:";

export interface Context7ClientOptions {
	apiKey?: string;
	fetch?: FetchLike;
}

function headers(apiKey?: string): Record<string, string> {
	return apiKey?.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {};
}

function string(value: unknown, maximum = 4096): string | undefined {
	return typeof value === "string" ? value.slice(0, maximum) : undefined;
}

function number(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function versions(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	return value
		.filter((entry): entry is string => typeof entry === "string")
		.slice(0, 100)
		.map((entry) => entry.slice(0, 256));
}

export function context7Ref(libraryId: string): string {
	return `${CONTEXT7_REF_PREFIX}${libraryId}`;
}

export function parseContext7Ref(ref: string): string | undefined {
	if (!ref.startsWith(CONTEXT7_REF_PREFIX)) return undefined;
	const libraryId = ref.slice(CONTEXT7_REF_PREFIX.length);
	return /^\/[a-zA-Z0-9._/-]+$/.test(libraryId) ? libraryId : undefined;
}

export class Context7Client {
	private readonly apiKey: string | undefined;
	private readonly fetch: FetchLike;

	constructor(options: Context7ClientOptions = {}) {
		this.apiKey = options.apiKey?.trim() || undefined;
		this.fetch = options.fetch ?? globalThis.fetch;
	}

	async search(
		request: SearchRequest,
		signal?: AbortSignal,
	): Promise<SearchResponse> {
		if (!request.target?.trim()) {
			throw new WebProviderError(
				"context7",
				"Documentation search requires a target library or product name.",
			);
		}
		const url = new URL(`${CONTEXT7_BASE_URL}/v2/libs/search`);
		url.searchParams.set("query", request.query);
		url.searchParams.set("libraryName", request.target.trim());
		const response = await this.fetch(url, {
			redirect: "manual",
			headers: headers(this.apiKey),
			signal: requestSignal(signal),
		});
		if (!response.ok) {
			throw await providerError("context7", response, this.apiKey);
		}
		const payload = await readResponseJson(response);
		if (typeof payload !== "object" || payload === null) {
			throw new WebProviderError(
				"context7",
				"Context7 returned an invalid library response.",
			);
		}
		const rawResults = (payload as Record<string, unknown>).results;
		if (!Array.isArray(rawResults)) {
			throw new WebProviderError(
				"context7",
				"Context7 library response has no results array.",
			);
		}
		const results: SearchResult[] = [];
		for (const raw of rawResults.slice(0, request.limit ?? 5)) {
			if (typeof raw !== "object" || raw === null) continue;
			const item = raw as Record<string, unknown>;
			const id = string(item.id, 2048);
			if (!id || !/^\/[a-zA-Z0-9._/-]+$/.test(id)) continue;
			const itemVersions = versions(item.versions);
			const trustScore = number(item.trustScore);
			const benchmarkScore = number(item.benchmarkScore);
			const totalSnippets = number(item.totalSnippets);
			results.push({
				ref: context7Ref(id),
				kind: "documentation",
				title: string(item.title) ?? string(item.name) ?? id,
				snippet: string(item.description, 2000) ?? "",
				provider: "context7",
				metadata: {
					...(trustScore === undefined ? {} : { trustScore }),
					...(benchmarkScore === undefined ? {} : { benchmarkScore }),
					...(totalSnippets === undefined
						? {}
						: { totalSnippets: Math.max(0, Math.trunc(totalSnippets)) }),
					...(itemVersions ? { versions: itemVersions } : {}),
				},
			});
		}
		const requestId = response.headers.get("x-request-id") ?? undefined;
		return {
			provider: "context7",
			results,
			...(requestId ? { requestId } : {}),
		};
	}

	async fetchContext(
		request: FetchRequest,
		libraryId: string,
		signal?: AbortSignal,
	): Promise<
		Omit<FetchResponse, "sha256" | "bytes" | "truncated"> & {
			providerTruncated?: boolean;
		}
	> {
		if (!request.query?.trim()) {
			throw new WebProviderError(
				"context7",
				"Documentation fetch requires a focused query.",
			);
		}
		const url = new URL(`${CONTEXT7_BASE_URL}/v2/context`);
		url.searchParams.set("query", request.query.trim());
		url.searchParams.set("libraryId", libraryId);
		url.searchParams.set("type", "txt");
		const response = await this.fetch(url, {
			redirect: "manual",
			headers: headers(this.apiKey),
			signal: requestSignal(signal),
		});
		if (!response.ok) {
			throw await providerError("context7", response, this.apiKey);
		}
		const content = await readResponseText(response);
		if (!content.trim()) {
			throw new WebProviderError(
				"context7",
				"Context7 returned no documentation for the library and query.",
			);
		}
		const requestId = response.headers.get("x-request-id") ?? undefined;
		const providerTruncated =
			response.headers.get("x-context7-has-next") === "true";
		return {
			ref: context7Ref(libraryId),
			provider: "context7",
			mediaType: "text/markdown",
			content,
			totalCharacters: content.length,
			...(requestId ? { requestId } : {}),
			...(providerTruncated ? { providerTruncated: true } : {}),
		};
	}
}
