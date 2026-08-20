import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { createWebService, type WebService } from "./service.js";
import { registerWebServiceProvider } from "./service-provider.js";
import { WEB_TOOL_DECLARATIONS } from "./tools.js";

export default function piWebExtension(pi: ExtensionAPI): void {
	let servicePromise: Promise<WebService> | undefined;
	let toolsRegistered = false;
	const ensureService = (): Promise<WebService> => {
		servicePromise ??= Promise.resolve(
			createWebService({
				...(process.env.EXA_API_KEY
					? { exaApiKey: process.env.EXA_API_KEY }
					: {}),
				...(process.env.CONTEXT7_API_KEY
					? { context7ApiKey: process.env.CONTEXT7_API_KEY }
					: {}),
			}),
		);
		return servicePromise;
	};
	const unregister = registerWebServiceProvider(pi.events, ensureService);

	pi.on("session_start", () => {
		if (toolsRegistered) return;
		const existing = new Set(pi.getAllTools().map((tool) => tool.name));
		for (const declaration of WEB_TOOL_DECLARATIONS) {
			if (existing.has(declaration.name)) {
				throw new Error(
					`pi-web tool collision: ${declaration.name} is already registered`,
				);
			}
		}
		for (const declaration of WEB_TOOL_DECLARATIONS) {
			pi.registerTool({
				name: declaration.name,
				label: declaration.label,
				description: declaration.description,
				promptGuidelines: [...declaration.promptGuidelines],
				parameters: declaration.parameters,
				async execute(_toolCallId, input, signal, onUpdate, ctx) {
					onUpdate?.({
						content: [
							{
								type: "text",
								text:
									declaration.name === "search"
										? "Searching external sources..."
										: "Fetching external content...",
							},
						],
						details: { phase: declaration.name },
					});
					return declaration.execute(
						await ensureService(),
						{ id: `pi-session:${ctx.sessionManager.getSessionId()}` },
						input,
						signal,
					);
				},
				renderCall(args, theme) {
					const record = args as Record<string, unknown>;
					const value =
						declaration.name === "search"
							? String(record.query ?? "")
							: String(record.ref ?? "");
					const display =
						value.length > 72 ? `${value.slice(0, 69)}...` : value;
					return new Text(
						`${theme.fg("toolTitle", theme.bold(declaration.label))} ${theme.fg("accent", display)}`,
						0,
						0,
					);
				},
				renderResult(result, { isPartial }, theme) {
					if (isPartial) {
						return new Text(
							theme.fg("warning", `${declaration.label}...`),
							0,
							0,
						);
					}
					const details = result.details as Record<string, unknown> | undefined;
					const provider =
						typeof details?.provider === "string"
							? details.provider
							: "external";
					return new Text(
						theme.fg("success", `${declaration.label} via ${provider}`),
						0,
						0,
					);
				},
			});
		}
		toolsRegistered = true;
	});
	pi.on("session_shutdown", () => {
		unregister();
		servicePromise = undefined;
		toolsRegistered = false;
	});
}
