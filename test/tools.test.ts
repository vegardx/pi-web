import { describe, expect, it } from "vitest";
import type { WebService } from "../src/service.js";
import { getWebToolDeclaration, WEB_TOOL_DECLARATIONS } from "../src/tools.js";

const service = {
	contract: {
		schema: "pi-web-runtime",
		contractRevision: 2,
		features: {
			interactiveTools: true,
			delegatedTools: true,
			exaSearch: true,
			exaFetch: true,
			context7Search: true,
			context7Fetch: true,
			persistentResources: false,
			repositorySnapshots: false,
		},
	},
	search: async () => ({
		provider: "exa" as const,
		results: [
			{
				ref: "https://example.com/",
				kind: "url" as const,
				title: "Example",
				snippet: "Example result",
				provider: "exa" as const,
				url: "https://example.com/",
			},
		],
	}),
	fetch: async () => ({
		ref: "https://example.com/",
		provider: "exa" as const,
		url: "https://example.com/",
		mediaType: "text/markdown",
		content: "# Untrusted",
		sha256: "a".repeat(64),
		bytes: 11,
		truncated: false,
	}),
} satisfies WebService;

describe("web tool declarations", () => {
	it("owns exactly one declaration for search and fetch", () => {
		expect(WEB_TOOL_DECLARATIONS.map((tool) => tool.name)).toEqual([
			"search",
			"fetch",
		]);
		expect(
			new Set(WEB_TOOL_DECLARATIONS.map((tool) => tool.identitySha256)).size,
		).toBe(2);
	});

	it("returns compact discovery and marks fetched content untrusted", async () => {
		const search = await getWebToolDeclaration("search").execute(
			service,
			{ id: "test" },
			{ query: "example" },
		);
		expect(search.content[0]).toMatchObject({
			type: "text",
			text: expect.stringContaining("ref: https://example.com/"),
		});
		const fetched = await getWebToolDeclaration("fetch").execute(
			service,
			{ id: "test" },
			{ ref: "https://example.com/" },
		);
		expect(fetched.content[0]).toMatchObject({
			type: "text",
			text: expect.stringContaining("untrusted source material"),
		});
	});

	it("bounds model-visible output by bytes and lines", async () => {
		const largeService = {
			...service,
			fetch: async () => ({
				ref: "https://example.com/",
				provider: "exa" as const,
				url: "https://example.com/",
				mediaType: "text/plain",
				content: "😀\n".repeat(30_000),
				sha256: "b".repeat(64),
				bytes: 150_000,
				truncated: false,
			}),
		} satisfies WebService;
		const result = await getWebToolDeclaration("fetch").execute(
			largeService,
			{ id: "test" },
			{ ref: "https://example.com/" },
		);
		const text = result.content[0];
		if (text?.type !== "text") throw new Error("missing text result");
		expect(Buffer.byteLength(text.text)).toBeLessThanOrEqual(50 * 1024);
		expect(text.text.split("\n").length).toBeLessThanOrEqual(2000);
		expect(text.text).toContain("Output truncated");
	});
});
