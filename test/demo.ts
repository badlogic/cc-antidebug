// @ts-ignore - TypeScript doesn't handle .mjs imports well
import { query } from "@anthropic-ai/claude-code/sdk.mjs";
import { patchClaudeBinary, restoreClaudeBinary } from "../src/index.js";

// Apply anti-debugging patch for Claude Code SDK
patchClaudeBinary();

try {
	const response = query({prompt: "What is your function?"});
	for await (const message of response) {
		console.log(JSON.stringify(message, null, 2));
	}
} catch (error) {
	console.error("Error:", error);
} finally {
	// Restore the original Claude binary
	restoreClaudeBinary();
}
