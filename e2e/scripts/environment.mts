/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The entry of the commands of the test environment, which the scripts of package.json run with Node:
// `node e2e/scripts/environment.mts <command>`. The commands are in commands.mts, which the tests import
// without running any.

import { main } from "./commands.mts";

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
