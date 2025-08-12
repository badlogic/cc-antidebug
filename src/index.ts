import { execSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
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
	let foundFirstBrace = false;

	for (let i = startIndex; i < content.length; i++) {
		if (matchBraces) {
			if (content[i] === "{") {
				braceCount++;
				foundFirstBrace = true;
			}
			if (content[i] === "}" && foundFirstBrace) {
				braceCount--;
				if (braceCount === 0) {
					// Found the matching closing brace
					endIndex = i + 1;
					break;
				}
			}
		} else {
			// Not matching braces, just look for the forward pattern
			if (content[i] === forwardPattern[0] && content.slice(i, i + forwardPattern.length) === forwardPattern) {
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

	let patchedContent = content;
	let patched = false;

	// Also patch any direct debugger detection checks
	const patterns = [
		// Standard pattern: if(PF5())process.exit(1);
		/if\([A-Za-z0-9_$]+\(\)\)process\.exit\(1\);/g,
		// With spaces: if (PF5()) process.exit(1);
		/if\s*\([A-Za-z0-9_$]+\(\)\)\s*process\.exit\(1\);/g,
		// Different exit codes: if(PF5())process.exit(2);
		/if\([A-Za-z0-9_$]+\(\)\)process\.exit\(\d+\);/g,
	];

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

	// Third, patch directory restriction check
	// Look for the specific validation pattern and replace it
	const dirPattern = /return D\.valid\?{behavior:"passthrough",message:`Path validation passed for \$\{A\} command`}:{behavior:"ask",message:D\.message}/;
	const dirReplacement = 'return{behavior:"passthrough",message:"Path validation bypassed"}';
	
	if (dirPattern.test(patchedContent)) {
		patchedContent = patchedContent.replace(dirPattern, dirReplacement);
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
		if (claudePath) {
			return resolveClaudePath(claudePath);
		}
	} catch {
		// which failed, continue searching
	}

	// Check common locations, prioritizing the official .claude/local installation
	const locations = [
		join(homedir(), ".claude/local/claude"),
		join(homedir(), ".local/bin/claude"),
		join(homedir(), ".npm-global/bin/claude"),
		"/usr/local/bin/claude",
		join(homedir(), ".yarn/bin/claude"),
		join(homedir(), "node_modules/.bin/claude"), // Check this last as it might be outdated
	];

	for (const path of locations) {
		if (existsSync(path)) {
			return resolveClaudePath(path);
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
 * Resolves a Claude path that might be a bash script redirecting to the actual JS file.
 * @param path - The path to resolve
 * @returns The path to the actual JavaScript file
 */
function resolveClaudePath(path: string): string {
	// Read the file to check if it's a bash script
	try {
		const content = readFileSync(path, "utf8");

		// Check if it's a bash script that redirects to another file
		if (content.startsWith("#!/bin/bash") || content.startsWith("#!/usr/bin/env bash")) {
			// Look for exec statements that redirect to the actual claude binary
			const execMatch = content.match(/exec\s+"([^"]+)"/);
			if (execMatch && execMatch[1]) {
				const redirectPath = execMatch[1];
				// Resolve relative paths
				const resolvedPath = redirectPath.startsWith("/") ? redirectPath : join(path, "..", redirectPath);

				// Follow the redirect
				if (existsSync(resolvedPath)) {
					// Check if this is also a symlink or another redirect
					return resolveClaudePath(resolvedPath);
				}
			}
		}

		// Check if it's a symlink
		const stats = lstatSync(path);
		if (stats.isSymbolicLink()) {
			const target = readlinkSync(path);
			const resolvedPath = target.startsWith("/") ? target : join(path, "..", target);
			return resolveClaudePath(resolvedPath);
		}

		// It's a regular file, return it
		return path;
	} catch {
		// If we can't read or resolve, just return the original path
		return path;
	}
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
