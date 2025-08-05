import { execSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Finds a pattern in content and replaces a range based on backward/forward scanning.
 *
 * @param content - The content to search in
 * @param searchPattern - The pattern to find
 * @param backwardPattern - Pattern to scan backward to (e.g., "return")
 * @param forwardPattern - Pattern to scan forward to (e.g., ";")
 * @param replacement - What to replace the range with
 * @param matchBraces - If true, will match curly braces when scanning
 * @returns The modified content, or null if pattern not found
 */
function scanAndReplace(
	content: string,
	searchPattern: string,
	backwardPattern: string,
	forwardPattern: string,
	replacement: string,
	matchBraces = false,
): string | null {
	const searchIndex = content.indexOf(searchPattern);
	if (searchIndex === -1) return null;

	// Scan backward to find the start pattern
	let startIndex = searchIndex;
	for (let i = searchIndex - 1; i >= 0; i--) {
		const slice = content.slice(i, searchIndex);
		if (slice.includes(backwardPattern)) {
			startIndex = i + slice.indexOf(backwardPattern);
			break;
		}
	}

	// Scan forward to find the end pattern
	let endIndex = searchIndex + searchPattern.length;
	let braceCount = 0;

	for (let i = searchIndex; i < content.length; i++) {
		if (matchBraces) {
			if (content[i] === "{") braceCount++;
			if (content[i] === "}") braceCount--;
		}

		if (content[i] === forwardPattern[0] && content.slice(i, i + forwardPattern.length) === forwardPattern) {
			if (!matchBraces || braceCount === 0) {
				endIndex = i + forwardPattern.length;
				break;
			}
		}
	}

	// Replace the range
	return content.slice(0, startIndex) + replacement + content.slice(endIndex);
}

/**
 * Patches the Claude binary to disable anti-debugging checks.
 * This allows you to debug your Node.js applications using the official Claude Code TypeScript SDK.
 *
 * @param claudePath - Optional path to the Claude binary. If not provided, it will be determined automatically.
 */
export function patchClaudeBinary(claudePath?: string): void {
	claudePath = claudePath ?? getClaudePath();

	// Create backup
	const backupPath = `${claudePath}.backup`;
	if (!existsSync(backupPath)) {
		copyFileSync(claudePath, backupPath);
	}

	// Read the Claude binary
	const content = readFileSync(claudePath, "utf8");

	// Multiple patterns to match different variations of anti-debugging checks
	const patterns = [
		// Standard pattern: if(PF5())process.exit(1);
		/if\([A-Za-z0-9_$]+\(\)\)process\.exit\(1\);/g,
		// With spaces: if (PF5()) process.exit(1);
		/if\s*\([A-Za-z0-9_$]+\(\)\)\s*process\.exit\(1\);/g,
		// Different exit codes: if(PF5())process.exit(2);
		/if\([A-Za-z0-9_$]+\(\)\)process\.exit\(\d+\);/g,
	];

	let patchedContent = content;
	let patched = false;

	// First, patch anti-debugging checks
	for (const pattern of patterns) {
		const newContent = patchedContent.replace(pattern, "if(false)process.exit(1);");
		if (newContent !== patchedContent) {
			patchedContent = newContent;
			patched = true;
		}
	}

	// Second, patch subscription check
	const subscriptionPatched = scanAndReplace(patchedContent, "no need to monitor cost", "return", ";", ";");

	if (subscriptionPatched) {
		patchedContent = subscriptionPatched;
		patched = true;
	}

	if (!patched) {
		// Already patched or no pattern found
		return;
	}

	// Write patched version
	writeFileSync(claudePath, patchedContent);
}

export function getClaudePath(): string {
	// First try which (in PATH)
	try {
		const claudePath = execSync("which claude", { encoding: "utf8" }).trim();
		if (claudePath) return claudePath;
	} catch {
		// which failed, continue searching
	}

	// Check common locations including the claude local installation
	const locations = [
		join(homedir(), ".claude/local/claude"),
		join(homedir(), ".npm-global/bin/claude"),
		"/usr/local/bin/claude",
		join(homedir(), ".local/bin/claude"),
		join(homedir(), "node_modules/.bin/claude"),
		join(homedir(), ".yarn/bin/claude"),
	];

	for (const path of locations) {
		if (existsSync(path)) {
			return path;
		}
	}

	// Check if Node.js is installed
	try {
		execSync("which node", { encoding: "utf8" });
	} catch {
		throw new Error(
			"Claude Code requires Node.js, which is not installed.\n" +
				"Install Node.js from: https://nodejs.org/\n" +
				"\nAfter installing Node.js, install Claude Code:\n" +
				"  npm install -g @anthropic-ai/claude-code",
		);
	}

	// Node is installed but Claude not found
	throw new Error(
		"Claude Code not found. Install with:\n" +
			"  npm install -g @anthropic-ai/claude-code\n" +
			"\nIf already installed locally, try:\n" +
			'  export PATH="$HOME/node_modules/.bin:$PATH"',
	);
}

/**
 * Restores the Claude binary from backup.
 * This reverts the anti-debugging patch applied by patchClaudeBinary.
 *
 * @param claudePath - Optional path to the Claude binary. If not provided, it will be determined automatically.
 */
export function restoreClaudeBinary(claudePath?: string): void {
	claudePath = claudePath ?? getClaudePath();

	const backupPath = `${claudePath}.backup`;

	if (!existsSync(backupPath)) {
		return;
	}

	// Restore from backup
	copyFileSync(backupPath, claudePath);
}
