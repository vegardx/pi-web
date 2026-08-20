import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import piWebExtension from "../src/extension.js";

function extensionApi(existing: string[] = []) {
	const tools: Array<{
		name: string;
		description: string;
		parameters: unknown;
	}> = [];
	const handlers = new Map<string, Array<() => void>>();
	const existingTools = existing.map((name) => ({
		name,
		description: "existing",
		parameters: {},
		promptGuidelines: [],
		sourceInfo: {},
	}));
	const api = {
		getAllTools: () => [
			...existingTools,
			...tools.filter(
				(tool) =>
					!existingTools.some(
						(existingTool) => existingTool.name === tool.name,
					),
			),
		],
		registerTool: (tool: {
			name: string;
			description: string;
			parameters: unknown;
		}) => tools.push(tool),
		on: (event: string, handler: () => void) => {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
		},
		events: {
			on() {
				return () => {};
			},
			emit() {},
		},
	} as unknown as ExtensionAPI;
	return {
		api,
		tools,
		start() {
			for (const handler of handlers.get("session_start") ?? []) handler();
		},
	};
}

describe("pi-web extension", () => {
	it("registers exactly the declared tools", () => {
		const { api, tools, start } = extensionApi();
		piWebExtension(api);
		start();
		expect(tools.map((tool) => tool.name)).toEqual(["search", "fetch"]);
	});

	it("fails startup instead of accepting prior ownership", () => {
		const { api, start } = extensionApi(["search"]);
		piWebExtension(api);
		expect(start).toThrow(
			"pi-web tool collision: search is already registered",
		);
	});
});
