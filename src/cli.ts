#!/usr/bin/env node
import { patchClaudeBinary, restoreClaudeBinary, getClaudePath } from "./index.js";

const command = process.argv[2];

try {
	const claudePath = getClaudePath();
	
	switch (command) {
		case "patch":
			patchClaudeBinary(claudePath);
			console.log(claudePath);
			break;
			
		case "restore":
			restoreClaudeBinary(claudePath);
			console.log(claudePath);
			break;
			
		default:
			console.error("Usage: cc-antidebug [patch|restore]");
			process.exit(1);
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}