#!/usr/bin/env node
import process from "node:process";
import { extractCommand, hasHelpFlag } from "./cli/args.js";
import { printRootHelp } from "./cli/help.js";
import { runLogin } from "./commands/login.js";
import { runInstall } from "./commands/install.js";
import { runDataset } from "./commands/dataset.js";
import { runModel } from "./commands/model.js";
import { runRepo } from "./commands/repo.js";
import { printRepoHelp } from "./commands/repo-help.js";
import { runWorkload } from "./commands/workload.js";
import { runRelease } from "./commands/release.js";

const argv = process.argv.slice(2);

if (argv.length === 0 || hasHelpFlag(argv)) {
    printRootHelp();
    process.exit(0);
}

const { command, argv: argvWithoutCommand } = extractCommand(argv);

function exitWithError(error) {
    const message = error?.message || String(error);
    process.stderr.write(`${message}\n`);
    process.exit(error?.exitCode || 1);
}

try {
    if (!command) {
        printRootHelp();
        process.exit(0);
    }

    if (command === "login") {
        await runLogin({ argv: argvWithoutCommand, env: process.env });
        process.exit(0);
    }

    if (command === "install") {
        await runInstall({ argv: argvWithoutCommand, env: process.env });
        process.exit(0);
    }

    if (command === "dataset") {
        await runDataset({ argv: argvWithoutCommand, env: process.env });
        process.exit(0);
    }

    if (command === "model") {
        await runModel({ argv: argvWithoutCommand, env: process.env });
        process.exit(0);
    }

    if (command === "workload") {
        await runWorkload({ argv: argvWithoutCommand, env: process.env });
        process.exit(0);
    }

    if (command === "repo") {
        if (hasHelpFlag(argvWithoutCommand)) {
            printRepoHelp();
            process.exit(0);
        }
        await runRepo({ argv: argvWithoutCommand, env: process.env });
        process.exit(0);
    }

    if (command === "release") {
        await runRelease({ argv: argvWithoutCommand, env: process.env });
        process.exit(0);
    }

    if (command === "help") {
        printRootHelp();
        process.exit(0);
    }

    throw new Error(`Unknown subcommand: ${command}`);
} catch (error) {
    exitWithError(error);
}
