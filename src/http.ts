export type FetchLike = typeof fetch;

const MAX_PROVIDER_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

export class WebProviderError extends Error {
	constructor(
		readonly provider: "exa" | "context7",
		message: string,
		readonly status?: number,
		readonly requestId?: string,
		readonly retryAfter?: string,
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = "WebProviderError";
	}
}

export function requestSignal(signal?: AbortSignal): AbortSignal {
	const timeout = AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
	return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function readResponseText(
	response: Response,
	maximumBytes = MAX_PROVIDER_RESPONSE_BYTES,
): Promise<string> {
	const body = response.body;
	if (!body) return "";
	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let bytes = 0;
	try {
		while (true) {
			const next = await reader.read();
			if (next.done) break;
			if (!next.value) continue;
			bytes += next.value.byteLength;
			if (bytes > maximumBytes) {
				throw new Error(`provider response exceeds ${maximumBytes} byte limit`);
			}
			chunks.push(next.value);
		}
	} finally {
		await reader.cancel().catch(() => {});
	}
	return new TextDecoder("utf-8", { fatal: true }).decode(
		Buffer.concat(chunks),
	);
}

export async function readResponseJson(response: Response): Promise<unknown> {
	const text = await readResponseText(response);
	try {
		return JSON.parse(text) as unknown;
	} catch (error) {
		throw new Error("provider returned invalid JSON", { cause: error });
	}
}

export async function providerError(
	provider: "exa" | "context7",
	response: Response,
	credential?: string,
): Promise<WebProviderError> {
	let message = response.statusText || `HTTP ${response.status}`;
	try {
		const text = await readResponseText(response, 64 * 1024);
		const parsed = JSON.parse(text) as unknown;
		if (typeof parsed === "object" && parsed !== null) {
			const record = parsed as Record<string, unknown>;
			const nested =
				typeof record.error === "object" && record.error !== null
					? (record.error as Record<string, unknown>)
					: undefined;
			const candidate = nested?.message ?? record.message ?? record.error;
			if (typeof candidate === "string" && candidate.trim()) {
				message = candidate.trim();
			}
		}
	} catch (error) {
		if (
			error instanceof Error &&
			(error.name === "AbortError" || error.name === "TimeoutError")
		) {
			throw error;
		}
		// The bounded status and provider still classify malformed error bodies.
	}
	if (credential) message = message.replaceAll(credential, "[REDACTED]");
	const redact = (value: string | null): string | undefined => {
		if (value === null) return undefined;
		return credential ? value.replaceAll(credential, "[REDACTED]") : value;
	};
	return new WebProviderError(
		provider,
		`${provider} request failed (${response.status}): ${message.slice(0, 4096)}`,
		response.status,
		redact(response.headers.get("x-request-id")),
		redact(response.headers.get("retry-after")),
	);
}
