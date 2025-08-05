# cc-antidebug

Disable Claude Code's anti-debugging so you can debug your Node.js apps that integrate the official Claude Code TypeScript SDK.

## Problem

Claude Code's TypeScript SDK prevents debugging by checking for inspector/debugger presence and terminating the `claude` process if detected. This is very annoying.

## Solution

This package patches the Claude binary to disable anti-debugging checks, allowing you to use debuggers with NodeJS apps that integrate the Claude Code SDK. This removes the annoyance.

## Installation

```bash
npm install @mariozechner/cc-antidebug
```

## Usage

### CLI

```bash
# One-time use with npx (no installation required)
npx @mariozechner/cc-antidebug patch
npx @mariozechner/cc-antidebug restore

# Or install globally
npm install -g @mariozechner/cc-antidebug

# Then use directly
cc-antidebug patch
cc-antidebug restore
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