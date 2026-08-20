import { describe, expect, it } from "vitest";
import { createWebService } from "../src/service.js";

function json(value: unknown, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(value), {
		status: 200,
		headers: { "content-type": "application/json", ...headers },
	});
}

describe("pi-web service", () => {
	it("routes web discovery to Exa without full page contents", async () => {
		const requests: Array<{ url: string; init?: RequestInit }> = [];
		const service = createWebService({
			exaApiKey: "exa-test-key",
			fetch: async (input, init) => {
				requests.push({
					url: String(input),
					...(init ? { init } : {}),
				});
				return json({
					requestId: "exa-request",
					costDollars: { total: 0.01 },
					results: [
						{
							title: "Pi",
							url: "https://pi.dev/",
							score: 0.9,
							highlights: ["Pi is a coding agent."],
						},
					],
				});
			},
		});
		const response = await service.search(
			{ id: "test" },
			{ query: "Pi coding agent", source: "web", limit: 5 },
		);
		expect(response).toMatchObject({
			provider: "exa",
			requestId: "exa-request",
			results: [
				{
					ref: "https://pi.dev/",
					snippet: "Pi is a coding agent.",
				},
			],
		});
		const body = JSON.parse(String(requests[0]?.init?.body)) as Record<
			string,
			unknown
		>;
		expect(requests[0]?.init?.redirect).toBe("manual");
		expect(body).not.toHaveProperty("text");
		expect(body.contents).toEqual({
			highlights: { query: "Pi coding agent", maxCharacters: 500 },
		});
	});

	it("routes documentation resolution and focused fetch to Context7", async () => {
		const urls: string[] = [];
		const service = createWebService({
			context7ApiKey: "ctx7sk-test",
			fetch: async (input) => {
				const url = String(input);
				urls.push(url);
				if (url.includes("libs/search")) {
					return json(
						{
							results: [
								{
									id: "/vercel/next.js",
									title: "Next.js",
									description: "React framework",
									totalSnippets: 100,
									trustScore: 9,
									benchmarkScore: 91,
									versions: ["v16"],
								},
							],
						},
						{ "x-request-id": "context-search" },
					);
				}
				return new Response("# Cache Components\n\nUse cacheComponents.", {
					status: 200,
					headers: {
						"x-request-id": "context-fetch",
						"x-context7-has-next": "true",
					},
				});
			},
		});
		const search = await service.search(
			{ id: "test" },
			{
				query: "Cache Components",
				source: "docs",
				target: "next.js",
			},
		);
		expect(search.results[0]).toMatchObject({
			ref: "context7:library:/vercel/next.js",
			kind: "documentation",
			metadata: { trustScore: 9, versions: ["v16"] },
		});
		const fetched = await service.fetch(
			{ id: "test" },
			{
				ref: "context7:library:/vercel/next.js",
				query: "How do Cache Components work?",
			},
		);
		expect(fetched).toMatchObject({
			provider: "context7",
			truncated: true,
			requestId: "context-fetch",
		});
		expect(fetched.sha256).toMatch(/^[a-f0-9]{64}$/);
		expect(urls[0]).toContain("libraryName=next.js");
		expect(urls[1]).toContain("libraryId=%2Fvercel%2Fnext.js");
	});

	it("rejects credential-bearing refs and redacts provider data", async () => {
		const service = createWebService({
			exaApiKey: "exa-secret",
			fetch: async () =>
				json({
					results: [
						{
							title: "exa-secret",
							url: "https://example.com/",
							highlights: ["exa-secret"],
						},
					],
				}),
		});
		const result = await service.search(
			{ id: "test" },
			{ query: "secret", source: "web" },
		);
		expect(JSON.stringify(result)).not.toContain("exa-secret");
		expect(JSON.stringify(result)).toContain("[REDACTED]");
		await expect(
			service.fetch(
				{ id: "test" },
				{ ref: "https://user:password@example.com/" },
			),
		).rejects.toThrow("must not contain embedded credentials");
	});

	it("redacts credentials from transport failures", async () => {
		const service = createWebService({
			exaApiKey: "exa-secret",
			fetch: async () => {
				throw new Error("transport failed with exa-secret");
			},
		});
		await expect(
			service.search({ id: "test" }, { query: "Pi", source: "web" }),
		).rejects.toThrow("transport failed with [REDACTED]");
	});

	it("rejects malformed successful provider payloads", async () => {
		const service = createWebService({
			exaApiKey: "exa-test-key",
			fetch: async () => json({ error: "wire drift" }),
		});
		await expect(
			service.search({ id: "test" }, { query: "Pi", source: "web" }),
		).rejects.toThrow("no results array");
	});

	it("enforces routing and content bounds", async () => {
		const service = createWebService({
			exaApiKey: "exa-test-key",
			fetch: async () =>
				json({
					results: [
						{
							title: "Large",
							url: "https://example.com/",
							text: "x".repeat(1001),
						},
					],
				}),
		});
		await expect(
			service.search({ id: "test" }, { query: "docs", source: "docs" }),
		).rejects.toThrow("requires a target");
		const fetched = await service.fetch(
			{ id: "test" },
			{ ref: "https://example.com", maxCharacters: 1000 },
		);
		expect(fetched.content).toHaveLength(1000);
		expect(fetched.truncated).toBe(true);
		expect(fetched.bytes).toBe(1000);
	});
});
