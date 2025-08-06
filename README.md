# cc-antidebug

Disable Claude Code's anti-debugging so you can debug your Node.js apps that integrate the official Claude Code TypeScript SDK.

## Problem

Claude Code's TypeScript SDK prevents debugging by checking for inspector/debugger presence and terminating the `claude` process if detected. This is very annoying.

## Solution

This package patches the Claude binary to:
1. Disable anti-debugging checks, allowing you to use debuggers with NodeJS apps that integrate the Claude Code SDK
2. Enable the `/cost` command for Pro and Max plan users, showing token usage and cost information for the current session

The patched binary is automatically formatted with Biome to ensure consistent code formatting.

**Note:** Claude Code may restore the binary on its own (e.g., during automatic version upgrades). You may need to re-run the patch command after Claude Code updates.

## Usage

### CLI

```bash
# Apply the patch
npx @mariozechner/cc-antidebug patch

# Restore the original binary
npx @mariozechner/cc-antidebug restore

# Optionally specify a custom Claude binary path
npx @mariozechner/cc-antidebug patch /path/to/claude
npx @mariozechner/cc-antidebug restore /path/to/claude
```

### Programmatic API

Import and patch before using Claude Code SDK, optionally restore the original binary:

```javascript
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

```

## License

MIT