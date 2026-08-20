import type { EventBus } from "@earendil-works/pi-coding-agent";
import { Value } from "typebox/value";
import { WEB_RUNTIME_CONTRACT, WebRuntimeContractSchema } from "./contracts.js";
import type { WebService } from "./service.js";

const SERVICE_REQUEST_CHANNEL = "@vegardx/pi-web/service-provider/request/v1";

export interface WebServiceProvider {
	readonly contract: typeof WEB_RUNTIME_CONTRACT;
	acquire(): Promise<WebService>;
}

interface ServiceRequest {
	readonly schema: "pi-web-service-request-v1";
	respond(provider: unknown): void;
}

export class WebServiceProviderError extends Error {
	constructor(
		readonly code: "missing" | "duplicate" | "incompatible",
		message: string,
	) {
		super(message);
		this.name = "WebServiceProviderError";
	}
}

function isRequest(value: unknown): value is ServiceRequest {
	if (typeof value !== "object" || value === null) return false;
	const request = value as Partial<ServiceRequest>;
	return (
		request.schema === "pi-web-service-request-v1" &&
		typeof request.respond === "function"
	);
}

function isService(value: unknown): value is WebService {
	if (typeof value !== "object" || value === null) return false;
	const service = value as Partial<WebService>;
	return (
		Value.Check(WebRuntimeContractSchema, service.contract) &&
		typeof service.search === "function" &&
		typeof service.fetch === "function"
	);
}

function isProvider(value: unknown): value is WebServiceProvider {
	if (typeof value !== "object" || value === null) return false;
	const provider = value as Partial<WebServiceProvider>;
	return (
		typeof provider.acquire === "function" &&
		Value.Check(WebRuntimeContractSchema, provider.contract) &&
		provider.contract.contractRevision === WEB_RUNTIME_CONTRACT.contractRevision
	);
}

export function registerWebServiceProvider(
	events: EventBus,
	acquire: () => Promise<WebService>,
): () => void {
	const provider: WebServiceProvider = {
		contract: WEB_RUNTIME_CONTRACT,
		acquire,
	};
	return events.on(SERVICE_REQUEST_CHANNEL, (value) => {
		if (isRequest(value)) value.respond(provider);
	});
}

export async function acquireWebService(events: EventBus): Promise<WebService> {
	const providers: unknown[] = [];
	const request: ServiceRequest = {
		schema: "pi-web-service-request-v1",
		respond(provider) {
			providers.push(provider);
		},
	};
	events.emit(SERVICE_REQUEST_CHANNEL, request);
	if (providers.length === 0) {
		throw new WebServiceProviderError(
			"missing",
			"No pi-web service provider is registered.",
		);
	}
	if (providers.length !== 1) {
		throw new WebServiceProviderError(
			"duplicate",
			`Expected one pi-web provider, received ${providers.length}.`,
		);
	}
	const provider = providers[0];
	if (!isProvider(provider)) {
		throw new WebServiceProviderError(
			"incompatible",
			"The registered pi-web service provider is incompatible.",
		);
	}
	const service = await provider.acquire();
	if (!isService(service)) {
		throw new WebServiceProviderError(
			"incompatible",
			"The pi-web provider returned an incompatible service.",
		);
	}
	return service;
}
