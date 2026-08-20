import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const temporary = await mkdtemp(path.join(os.tmpdir(), "pi-web-pack-"));
const archives = path.join(temporary, "archives");
const project = path.join(temporary, "project");

try {
	await mkdir(archives, { recursive: true });
	await mkdir(project, { recursive: true });
	const { stdout } = await execFileAsync(
		"npm",
		["pack", "--ignore-scripts", "--json", "--pack-destination", archives],
		{ cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
	);
	const [packed] = JSON.parse(stdout);
	if (!packed?.filename || !Array.isArray(packed.files)) {
		throw new Error("npm pack did not return a file manifest");
	}
	const paths = new Set(packed.files.map((file) => file.path));
	for (const required of [
		"LICENSE",
		"README.md",
		"dist/index.js",
		"dist/index.d.ts",
		"dist/extension.js",
		"dist/service-provider.js",
		"package.json",
	]) {
		if (!paths.has(required))
			throw new Error(`packed file missing: ${required}`);
	}
	for (const filePath of paths) {
		if (filePath.startsWith("src/") || filePath.startsWith("test/")) {
			throw new Error(`development source leaked: ${filePath}`);
		}
	}
	if (packed.entryCount > 100 || packed.unpackedSize > 1024 * 1024) {
		throw new Error("packed package exceeds release bounds");
	}
	await writeFile(
		path.join(project, "package.json"),
		'{"name":"pi-web-pack-check","private":true,"type":"module"}\n',
	);
	await execFileAsync(
		"npm",
		[
			"install",
			"--ignore-scripts",
			"--no-package-lock",
			"--no-audit",
			"--no-fund",
			path.join(archives, packed.filename),
		],
		{ cwd: project, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
	);
	await execFileAsync(
		process.execPath,
		[
			"--input-type=module",
			"--eval",
			'const web = await import("@vegardx/pi-web"); const provider = await import("@vegardx/pi-web/service-provider"); const extension = await import("@vegardx/pi-web/extension"); if (web.WEB_RUNTIME_CONTRACT.schema !== "pi-web-runtime" || web.WEB_TOOL_DECLARATIONS.length !== 2 || typeof provider.acquireWebService !== "function" || typeof extension.default !== "function") throw new Error("packed exports unavailable");',
		],
		{ cwd: project, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
	);
} finally {
	await rm(temporary, { recursive: true, force: true });
}
