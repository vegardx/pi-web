import { StringEnum } from "@earendil-works/pi-ai";
import { type Static, type TSchema, Type } from "typebox";
import { Value } from "typebox/value";

export const WEB_CONTRACT_REVISION = 1 as const;

const Sha256Schema = Type.String({ pattern: "^[a-f0-9]{64}$" });
const HttpUrlSchema = Type.String({ pattern: "^https?://", maxLength: 8192 });
const DomainSchema = Type.String({
	pattern:
		"^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$",
	maxLength: 253,
});

export const WebProviderSchema = Type.Union([
	Type.Literal("exa"),
	Type.Literal("context7"),
]);
export type WebProvider = Static<typeof WebProviderSchema>;

export type SearchSource = "auto" | "web" | "docs";
export const SearchSourceSchema: TSchema = StringEnum([
	"auto",
	"web",
	"docs",
] as const);

export const SearchRequestSchema = Type.Object(
	{
		query: Type.String({ minLength: 1, maxLength: 4096 }),
		source: Type.Optional(SearchSourceSchema),
		target: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
		limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
		includeDomains: Type.Optional(
			Type.Array(DomainSchema, { maxItems: 20, uniqueItems: true }),
		),
		excludeDomains: Type.Optional(
			Type.Array(DomainSchema, { maxItems: 20, uniqueItems: true }),
		),
		publishedAfter: Type.Optional(
			Type.String({ minLength: 10, maxLength: 64 }),
		),
	},
	{ additionalProperties: false },
);
export interface SearchRequest {
	query: string;
	source?: SearchSource;
	target?: string;
	limit?: number;
	includeDomains?: string[];
	excludeDomains?: string[];
	publishedAfter?: string;
}

export const SearchResultSchema = Type.Object(
	{
		ref: Type.String({ minLength: 1, maxLength: 8192 }),
		kind: Type.Union([Type.Literal("url"), Type.Literal("documentation")]),
		title: Type.String({ maxLength: 4096 }),
		snippet: Type.String({ maxLength: 2000 }),
		provider: WebProviderSchema,
		url: Type.Optional(HttpUrlSchema),
		publishedAt: Type.Optional(Type.String({ maxLength: 128 })),
		score: Type.Optional(Type.Number()),
		metadata: Type.Optional(
			Type.Object(
				{
					trustScore: Type.Optional(Type.Number()),
					benchmarkScore: Type.Optional(Type.Number()),
					totalSnippets: Type.Optional(Type.Integer({ minimum: 0 })),
					versions: Type.Optional(
						Type.Array(Type.String({ maxLength: 256 }), {
							maxItems: 100,
						}),
					),
				},
				{ additionalProperties: false },
			),
		),
	},
	{ additionalProperties: false },
);
export type SearchResult = Static<typeof SearchResultSchema>;

export const SearchResponseSchema = Type.Object(
	{
		provider: WebProviderSchema,
		results: Type.Array(SearchResultSchema, { maxItems: 10 }),
		requestId: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
		costDollars: Type.Optional(Type.Number({ minimum: 0 })),
	},
	{ additionalProperties: false },
);
export type SearchResponse = Static<typeof SearchResponseSchema>;

export type FetchFreshness = "cached" | "fallback" | "fresh";
export const FetchFreshnessSchema: TSchema = StringEnum([
	"cached",
	"fallback",
	"fresh",
] as const);

export const FetchRequestSchema = Type.Object(
	{
		ref: Type.String({ minLength: 1, maxLength: 8192 }),
		query: Type.Optional(Type.String({ minLength: 1, maxLength: 4096 })),
		maxCharacters: Type.Optional(
			Type.Integer({ minimum: 1000, maximum: 50_000 }),
		),
		freshness: Type.Optional(FetchFreshnessSchema),
	},
	{ additionalProperties: false },
);
export interface FetchRequest {
	ref: string;
	query?: string;
	maxCharacters?: number;
	freshness?: FetchFreshness;
}

export const FetchResponseSchema = Type.Object(
	{
		ref: Type.String({ minLength: 1, maxLength: 8192 }),
		provider: WebProviderSchema,
		title: Type.Optional(Type.String({ maxLength: 4096 })),
		url: Type.Optional(HttpUrlSchema),
		mediaType: Type.String({ minLength: 1, maxLength: 256 }),
		content: Type.String({ maxLength: 50_000 }),
		sha256: Sha256Schema,
		bytes: Type.Integer({ minimum: 0, maximum: 1024 * 1024 }),
		totalCharacters: Type.Optional(Type.Integer({ minimum: 0 })),
		truncated: Type.Boolean(),
		requestId: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
		costDollars: Type.Optional(Type.Number({ minimum: 0 })),
	},
	{ additionalProperties: false },
);
export type FetchResponse = Static<typeof FetchResponseSchema>;

export const WebRuntimeContractSchema = Type.Object(
	{
		schema: Type.Literal("pi-web-runtime"),
		contractRevision: Type.Literal(WEB_CONTRACT_REVISION),
		features: Type.Object(
			{
				interactiveTools: Type.Boolean(),
				delegatedTools: Type.Boolean(),
				exaSearch: Type.Boolean(),
				exaFetch: Type.Boolean(),
				context7Search: Type.Boolean(),
				context7Fetch: Type.Boolean(),
				persistentResources: Type.Boolean(),
				repositorySnapshots: Type.Boolean(),
			},
			{ additionalProperties: false },
		),
	},
	{ additionalProperties: false },
);
export type WebRuntimeContract = Static<typeof WebRuntimeContractSchema>;

export const WEB_RUNTIME_CONTRACT: WebRuntimeContract = Object.freeze({
	schema: "pi-web-runtime",
	contractRevision: WEB_CONTRACT_REVISION,
	features: Object.freeze({
		interactiveTools: true,
		delegatedTools: false,
		exaSearch: true,
		exaFetch: true,
		context7Search: true,
		context7Fetch: true,
		persistentResources: false,
		repositorySnapshots: false,
	}),
});

export function isSearchRequest(value: unknown): value is SearchRequest {
	return Value.Check(SearchRequestSchema, value);
}

export function isFetchRequest(value: unknown): value is FetchRequest {
	return Value.Check(FetchRequestSchema, value);
}

export function isWebRuntimeContract(
	value: unknown,
): value is WebRuntimeContract {
	return Value.Check(WebRuntimeContractSchema, value);
}
