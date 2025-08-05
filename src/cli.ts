#!/usr/bin/env node
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { getClaudePath, patchClaudeBinary, restoreClaudeBinary } from "./index.js";

const command = process.argv[2];
const customPath = process.argv[3];

try {
	const claudePath = customPath || getClaudePath();

	switch (command) {
		case "patch":
			patchClaudeBinary(claudePath);
			// Format the patched file with biome
			// Since biome refuses to format files in node_modules, we'll use a temp directory
			try {
				// Create a temporary directory
				const tempDir = mkdtempSync(join(tmpdir(), "cc-antidebug-"));
				const fileName = basename(claudePath);
				// Always use .js extension for biome
				const tempFileName = fileName.endsWith(".js") ? fileName : `${fileName}.js`;
				const tempFile = join(tempDir, tempFileName);

				try {
					// Copy to temp directory with .js extension
					execSync(`cp "${claudePath}" "${tempFile}"`, { stdio: "pipe" });

					// Create a biome config that allows large files
					const biomeConfig = {
						$schema: "https://biomejs.dev/schemas/1.9.4/schema.json",
						files: {
							maxSize: 104857600, // 100MB - should be enough for any Claude binary
						},
						formatter: {
							enabled: true,
							formatWithErrors: false,
							indentStyle: "tab",
							indentWidth: 3,
							lineWidth: 120,
						},
					};
					writeFileSync(join(tempDir, "biome.json"), JSON.stringify(biomeConfig, null, 2));

					// Format with biome (with cwd set to temp directory)
					const result = execSync(`npx @biomejs/biome format --write "${tempFileName}"`, {
						encoding: "utf8",
						cwd: tempDir,
					});

					// Copy formatted file back
					execSync(`cp "${tempFile}" "${claudePath}"`, { stdio: "pipe" });
				} finally {
					// Clean up temp directory
					try {
						execSync(`rm -rf "${tempDir}"`, { stdio: "pipe" });
					} catch {
						// Ignore cleanup errors
					}
				}
			} catch (error) {
				// Show biome error but continue - patch was still successful
				if (error instanceof Error && "stderr" in error) {
					console.error((error as any).stderr || error.message);
				} else {
					console.error(String(error));
				}
				console.error("Formatting failed, but patch was applied successfully");
			}
			console.log(`Patched ${claudePath}`);
			break;

		case "restore":
			restoreClaudeBinary(claudePath);
			console.log(`Restored ${claudePath}`);
			break;

		default:
			console.error("Usage: cc-antidebug [patch|restore] [path]");
			process.exit(1);
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}
