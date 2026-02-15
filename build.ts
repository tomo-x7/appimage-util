import { execSync } from "child_process";
import { build } from "esbuild";
import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync } from "fs";
import { dirname, resolve } from "path";
import { inject } from "postject";
import { fileURLToPath } from "url";

const rootDir = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(rootDir, "dist");
const entryFile = resolve(rootDir, "src/index.ts");
const bundledFile = resolve(distDir, "index.js");
const outputBinary = resolve(distDir, "appimage-util");
const seaConfigFile = resolve(rootDir, "sea-config.json");
const seaBlobFile = resolve(distDir, "appimage-util.blob");

rmSync(distDir, { force: true, recursive: true });
mkdirSync(distDir, { recursive: true });

await build({
	bundle: true,
	entryPoints: [entryFile],
	outfile: bundledFile,
	platform: "node",
	target: "node22",
	format: "cjs",
});

cpSync(process.execPath, outputBinary);
chmodSync(outputBinary, 0o755);

execSync(`node --experimental-sea-config "${seaConfigFile}"`, {
	cwd: rootDir,
	stdio: "inherit",
});

const seaBlob = readFileSync(seaBlobFile);
await inject(outputBinary, "NODE_SEA_BLOB", seaBlob, {
	sentinelFuse: "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
});
