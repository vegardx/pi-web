import type {
	FetchFreshness,
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
	requestSignal,
	WebProviderError,
} from "../http.js";

const EXA_BASE_URL = "https://api.exa.ai";
const SEARCH_SNIPPET_CHARACTERS = 500;

export interface ExaClientOptions {
	apiKey?: string;
	fetch?: FetchLike;
}

function requiredKey(apiKey?: string): string {
	if (!apiKey?.trim()) {
		throw new WebProviderError(
			"exa",
			"Exa is unavailable: EXA_API_KEY is not configured.",
		);
	}
	return apiKey.trim();
}

function headers(apiKey: string): Record<string, string> {
	return {
		"Content-Type": "application/json",
		"x-api-key": apiKey,
		"x-exa-integration": "pi-web",
	};
}

function string(value: unknown, maximum = 4096): string | undefined {
	if (typeof value !== "string") return undefined;
	return value.slice(0, maximum);
}

function number(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function validUrl(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:"
			? url.toString()
			: undefined;
	} catch {
		return undefined;
	}
}

function snippet(record: Record<string, unknown>): string {
	const highlights = Array.isArray(record.highlights)
		? record.highlights.filter(
				(value): value is string => typeof value === "string",
			)
		: [];
	return highlights.join(" ").slice(0, 2000);
}

function cost(value: unknown): number | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	return number((value as Record<string, unknown>).total);
}

export class ExaClient {
	private readonly apiKey: string | undefined;
	private readonly fetch: FetchLike;

	constructor(options: ExaClientOptions = {}) {
		this.apiKey = options.apiKey?.trim() || undefined;
		this.fetch = options.fetch ?? globalThis.fetch;
	}

	async search(
		request: SearchRequest,
		signal?: AbortSignal,
	): Promise<SearchResponse> {
		const apiKey = requiredKey(this.apiKey);
		const response = await this.fetch(`${EXA_BASE_URL}/search`, {
			method: "POST",
			redirect: "manual",
			headers: headers(apiKey),
			body: JSON.stringify({
				query: request.query,
				type: "auto",
				numResults: request.limit ?? 5,
				contents: {
					highlights: {
						query: request.query,
						maxCharacters: SEARCH_SNIPPET_CHARACTERS,
					},
				},
				...(request.includeDomains
					? { includeDomains: request.includeDomains }
					: {}),
				...(request.excludeDomains
					? { excludeDomains: request.excludeDomains }
					: {}),
				...(request.publishedAfter
					? { startPublishedDate: request.publishedAfter }
					: {}),
			}),
			signal: requestSignal(signal),
		});
		if (!response.ok) throw await providerError("exa", response, apiKey);
		const payload = await readResponseJson(response);
		if (typeof payload !== "object" || payload === null) {
			throw new WebProviderError(
				"exa",
				"Exa returned an invalid search response.",
			);
		}
		const record = payload as Record<string, unknown>;
		if (!Array.isArray(record.results)) {
			throw new WebProviderError(
				"exa",
				"Exa search response has no results array.",
			);
		}
		const rawResults = record.results;
		const results: SearchResult[] = [];
		for (const raw of rawResults.slice(0, request.limit ?? 5)) {
			if (typeof raw !== "object" || raw === null) continue;
			const item = raw as Record<string, unknown>;
			const url = validUrl(item.url);
			if (!url) continue;
			const publishedAt = string(item.publishedDate, 128);
			const score = number(item.score);
			results.push({
				ref: url,
				kind: "url",
				title: string(item.title) ?? url,
				snippet: snippet(item),
				provider: "exa",
				url,
				...(publishedAt ? { publishedAt } : {}),
				...(score === undefined ? {} : { score }),
			});
		}
		const requestId = string(record.requestId, 512);
		const costDollars = cost(record.costDollars);
		return {
			provider: "exa",
			results,
			...(requestId ? { requestId } : {}),
			...(costDollars === undefined ? {} : { costDollars }),
		};
	}

	async fetchContent(
		request: FetchRequest,
		url: string,
		maximumCharacters: number,
		signal?: AbortSignal,
	): Promise<Omit<FetchResponse, "sha256" | "bytes" | "truncated">> {
		const apiKey = requiredKey(this.apiKey);
		const freshness = request.freshness ?? "fallback";
		const freshnessOptions = exaFreshness(freshness);
		const response = await this.fetch(`${EXA_BASE_URL}/contents`, {
			method: "POST",
			redirect: "manual",
			headers: headers(apiKey),
			body: JSON.stringify({
				urls: [url],
				text: { maxCharacters: maximumCharacters + 1 },
				...freshnessOptions,
			}),
			signal: requestSignal(signal),
		});
		if (!response.ok) throw await providerError("exa", response, apiKey);
		const payload = await readResponseJson(response);
		if (typeof payload !== "object" || payload === null) {
			throw new WebProviderError(
				"exa",
				"Exa returned an invalid contents response.",
			);
		}
		const record = payload as Record<string, unknown>;
		const first = Array.isArray(record.results) ? record.results[0] : undefined;
		if (typeof first !== "object" || first === null) {
			throw new WebProviderError("exa", "Exa returned no content for the URL.");
		}
		const item = first as Record<string, unknown>;
		const content = typeof item.text === "string" ? item.text : undefined;
		if (content === undefined) {
			throw new WebProviderError(
				"exa",
				"Exa returned no text content for the URL.",
			);
		}
		const title = string(item.title);
		const requestId = string(record.requestId, 512);
		const costDollars = cost(record.costDollars);
		return {
			ref: url,
			provider: "exa",
			...(title ? { title } : {}),
			url,
			mediaType: "text/plain",
			content,
			totalCharacters: content.length,
			...(requestId ? { requestId } : {}),
			...(costDollars === undefined ? {} : { costDollars }),
		};
	}
}

function exaFreshness(freshness: FetchFreshness): {
	livecrawl: "never" | "fallback" | "always";
	maxAgeHours: number;
} {
	switch (freshness) {
		case "cached":
			return { livecrawl: "never", maxAgeHours: -1 };
		case "fresh":
			return { livecrawl: "always", maxAgeHours: 0 };
		case "fallback":
			return { livecrawl: "fallback", maxAgeHours: 24 };
	}
}
