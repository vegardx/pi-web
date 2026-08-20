import type { EventBus } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { createWebService } from "../src/service.js";
import {
	acquireDelegatedWebTools,
	acquireWebService,
	registerWebServiceProvider,
	WebServiceProviderError,
} from "../src/service-provider.js";

class FakeEvents {
	private readonly handlers = new Map<string, Set<(value: unknown) => void>>();
	on(channel: string, handler: (value: unknown) => void): () => void {
		const handlers = this.handlers.get(channel) ?? new Set();
		handlers.add(handler);
		this.handlers.set(channel, handlers);
		return () => handlers.delete(handler);
	}
	emit(channel: string, value: unknown): void {
		for (const handler of this.handlers.get(channel) ?? []) handler(value);
	}
}

describe("web service provider", () => {
	it("acquires the exact registered service", async () => {
		const events = new FakeEvents() as unknown as EventBus;
		const service = createWebService();
		const unregister = registerWebServiceProvider(events, async () => service);
		expect(await acquireWebService(events)).toBe(service);
		const tools = acquireDelegatedWebTools(events);
		expect(tools.map((tool) => tool.name)).toEqual(["search", "fetch"]);
		expect(tools.every((tool) => tool.identitySha256.length === 64)).toBe(true);
		unregister();
		await expect(acquireWebService(events)).rejects.toMatchObject({
			code: "missing",
		});
	});

	it("rejects a provider that resolves an invalid service", async () => {
		const events = new FakeEvents() as unknown as EventBus;
		(events as unknown as FakeEvents).on(
			"@vegardx/pi-web/service-provider/request/v1",
			(value) => {
				const request = value as { respond(provider: unknown): void };
				request.respond({
					contract: createWebService().contract,
					acquire: async () => ({ contract: createWebService().contract }),
				});
			},
		);
		await expect(acquireWebService(events)).rejects.toMatchObject({
			code: "incompatible",
		});
	});

	it("rejects duplicate providers", async () => {
		const events = new FakeEvents() as unknown as EventBus;
		const service = createWebService();
		registerWebServiceProvider(events, async () => service);
		registerWebServiceProvider(events, async () => service);
		await expect(acquireWebService(events)).rejects.toBeInstanceOf(
			WebServiceProviderError,
		);
		await expect(acquireWebService(events)).rejects.toMatchObject({
			code: "duplicate",
		});
	});
});
