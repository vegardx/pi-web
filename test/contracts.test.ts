import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
	FetchRequestSchema,
	isWebRuntimeContract,
	SearchRequestSchema,
	WEB_RUNTIME_CONTRACT,
} from "../src/contracts.js";

describe("pi-web contracts", () => {
	it("publishes the exact initial runtime contract", () => {
		expect(isWebRuntimeContract(WEB_RUNTIME_CONTRACT)).toBe(true);
		expect(WEB_RUNTIME_CONTRACT).toMatchObject({
			schema: "pi-web-runtime",
			contractRevision: 2,
			features: {
				interactiveTools: true,
				delegatedTools: true,
				persistentResources: false,
				repositorySnapshots: false,
			},
		});
	});

	it("bounds search and fetch inputs", () => {
		expect(Value.Check(SearchRequestSchema, { query: "Pi extensions" })).toBe(
			true,
		);
		expect(
			Value.Check(SearchRequestSchema, {
				query: "x",
				limit: 11,
			}),
		).toBe(false);
		expect(
			Value.Check(FetchRequestSchema, {
				ref: "https://example.com",
				maxCharacters: 50_001,
			}),
		).toBe(false);
		expect(
			Value.Check(FetchRequestSchema, {
				ref: "https://example.com",
				legacy: true,
			}),
		).toBe(false);
	});
});
