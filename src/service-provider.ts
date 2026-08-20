import type {
	AgentToolResult,
	EventBus,
} from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import { Value } from "typebox/value";
import { WEB_RUNTIME_CONTRACT, WebRuntimeContractSchema } from "./contracts.js";
import type { WebOwner, WebService } from "./service.js";
import {
	WEB_TOOL_DECLARATIONS,
	type WebToolAuthority,
	type WebToolName,
} from "./tools.js";

export const WEB_SERVICE_REQUEST_CHANNEL =
	"@vegardx/pi-web/service-provider/request/v1";

export interface DelegatedWebTool {
	readonly name: WebToolName;
	readonly label: string;
	readonly description: string;
	readonly promptGuidelines: readonly string[];
	readonly parameters: TSchema;
	readonly authority: WebToolAuthority;
	readonly identitySha256: string;
	execute(
		owner: WebOwner,
		input: unknown,
		signal?: AbortSignal,
	): Promise<AgentToolResult<unknown>>;
}

export interface WebServiceProvider {
	readonly contract: typeof WEB_RUNTIME_CONTRACT;
	readonly delegatedTools: readonly DelegatedWebTool[];
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

function isDelegatedTool(value: unknown): value is DelegatedWebTool {
	if (typeof value !== "object" || value === null) return false;
	const tool = value as Partial<DelegatedWebTool>;
	const expected = WEB_TOOL_DECLARATIONS.find(
		(declaration) => declaration.name === tool.name,
	);
	return (
		expected !== undefined &&
		tool.label === expected.label &&
		tool.description === expected.description &&
		tool.authority === expected.authority &&
		tool.identitySha256 === expected.identitySha256 &&
		JSON.stringify(tool.parameters) === JSON.stringify(expected.parameters) &&
		typeof tool.execute === "function"
	);
}

function isProvider(value: unknown): value is WebServiceProvider {
	if (typeof value !== "object" || value === null) return false;
	const provider = value as Partial<WebServiceProvider>;
	return (
		typeof provider.acquire === "function" &&
		Value.Check(WebRuntimeContractSchema, provider.contract) &&
		provider.contract.contractRevision ===
			WEB_RUNTIME_CONTRACT.contractRevision &&
		Array.isArray(provider.delegatedTools) &&
		provider.delegatedTools.length === WEB_TOOL_DECLARATIONS.length &&
		provider.delegatedTools.every(isDelegatedTool)
	);
}

function bindDelegatedTools(
	acquire: () => Promise<WebService>,
): readonly DelegatedWebTool[] {
	return Object.freeze(
		WEB_TOOL_DECLARATIONS.map((declaration) =>
			Object.freeze({
				name: declaration.name,
				label: declaration.label,
				description: declaration.description,
				promptGuidelines: declaration.promptGuidelines,
				parameters: declaration.parameters,
				authority: declaration.authority,
				identitySha256: declaration.identitySha256,
				execute: async (
					owner: WebOwner,
					input: unknown,
					signal?: AbortSignal,
				) => declaration.execute(await acquire(), owner, input, signal),
			}),
		),
	);
}

export function registerWebServiceProvider(
	events: EventBus,
	acquire: () => Promise<WebService>,
): () => void {
	const provider: WebServiceProvider = {
		contract: WEB_RUNTIME_CONTRACT,
		delegatedTools: bindDelegatedTools(acquire),
		acquire,
	};
	return events.on(WEB_SERVICE_REQUEST_CHANNEL, (value) => {
		if (isRequest(value)) value.respond(provider);
	});
}

export function acquireWebServiceProvider(
	events: EventBus,
): WebServiceProvider {
	const providers: unknown[] = [];
	const request: ServiceRequest = {
		schema: "pi-web-service-request-v1",
		respond(provider) {
			providers.push(provider);
		},
	};
	events.emit(WEB_SERVICE_REQUEST_CHANNEL, request);
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
	return provider;
}

export async function acquireWebService(events: EventBus): Promise<WebService> {
	const service = await acquireWebServiceProvider(events).acquire();
	if (!isService(service)) {
		throw new WebServiceProviderError(
			"incompatible",
			"The pi-web provider returned an incompatible service.",
		);
	}
	return service;
}

export function acquireDelegatedWebTools(
	events: EventBus,
): readonly DelegatedWebTool[] {
	return acquireWebServiceProvider(events).delegatedTools;
}
