#!/usr/bin/env node
import process from "node:process";
import { extractCommand, hasHelpFlag } from "./cli/args.js";
import {
    printConnectHelp,
    printCreateHelp,
    printDownloadHelp,
    printImageHelp,
    printInstallHelp,
    printLoginHelp,
    printReleaseHelp,
    printRootHelp,
    printWorkloadHelp,
} from "./cli/help.js";
import { runConnect } from "./commands/connect.js";
import { runCreate } from "./commands/create.js";
import { runDownload } from "./commands/download.js";
import { runLogin } from "./commands/login.js";
import { runInstall } from "./commands/install.js";
import { runRepo } from "./commands/repo.js";
import { printRepoHelp } from "./commands/repo-help.js";
import { runWorkload } from "./commands/workload.js";
import { runRelease } from "./commands/release.js";
import { runImage } from "./commands/image.js";

const argv = process.argv.slice(2);

if (argv.length === 0 || (argv.length === 1 && hasHelpFlag(argv))) {
    printRootHelp();
    process.exit(0);
}

const { command, argv: argvWithoutCommand } = extractCommand(argv);

function exitWithError(error) {
    const message = error?.message || String(error);
    process.stderr.write(`${message}\n`);
    process.exit(error?.exitCode || 1);
}

function printCommandHelp(command) {
    if (command === "login") return printLoginHelp();
    if (command === "install") return printInstallHelp();
    if (command === "create") return printCreateHelp();
    if (command === "connect") return printConnectHelp();
    if (command === "download") return printDownloadHelp();
    if (command === "repo") return printRepoHelp();
    if (command === "workload") return printWorkloadHelp();
    if (command === "image") return printImageHelp();
    if (command === "release") return printReleaseHelp();
    return printRootHelp();
}

try {
    if (!command) {
        printRootHelp();
        process.exit(0);
    }

    if (command === "login") {
        if (hasHelpFlag(argvWithoutCommand)) {
            printLoginHelp();
            process.exit(0);
        }
        await runLogin({ argv: argvWithoutCommand, env: process.env });
        process.exit(0);
    }

    if (command === "install") {
        if (hasHelpFlag(argvWithoutCommand)) {
            printInstallHelp();
            process.exit(0);
        }
        await runInstall({ argv: argvWithoutCommand, env: process.env });
        process.exit(0);
    }

    if (command === "create") {
        if (argvWithoutCommand.length === 0 || hasHelpFlag(argvWithoutCommand)) {
            printCreateHelp();
            process.exit(0);
        }
        await runCreate({ argv: argvWithoutCommand, env: process.env });
        process.exit(0);
    }

    if (command === "connect") {
        if (argvWithoutCommand.length === 0 || hasHelpFlag(argvWithoutCommand)) {
            printConnectHelp();
            process.exit(0);
        }
        await runConnect({ argv: argvWithoutCommand, env: process.env });
        process.exit(0);
    }

    if (command === "download") {
        if (argvWithoutCommand.length === 0 || hasHelpFlag(argvWithoutCommand)) {
            printDownloadHelp();
            process.exit(0);
        }
        await runDownload({ argv: argvWithoutCommand, env: process.env });
        process.exit(0);
    }

    if (command === "workload") {
        if (argvWithoutCommand.length === 0 || hasHelpFlag(argvWithoutCommand)) {
            printWorkloadHelp();
            process.exit(0);
        }
        await runWorkload({ argv: argvWithoutCommand, env: process.env });
        process.exit(0);
    }

    if (command === "repo") {
        if (argvWithoutCommand.length === 0 || hasHelpFlag(argvWithoutCommand)) {
            printRepoHelp();
            process.exit(0);
        }
        await runRepo({ argv: argvWithoutCommand, env: process.env });
        process.exit(0);
    }

    if (command === "image") {
        if (argvWithoutCommand.length === 0 || hasHelpFlag(argvWithoutCommand)) {
            printImageHelp();
            process.exit(0);
        }
        await runImage({ argv: argvWithoutCommand, env: process.env });
        process.exit(0);
    }

    if (command === "release") {
        if (hasHelpFlag(argvWithoutCommand)) {
            printReleaseHelp();
            process.exit(0);
        }
        await runRelease({ argv: argvWithoutCommand, env: process.env });
        process.exit(0);
    }

    if (command === "help") {
        printCommandHelp(argvWithoutCommand[0]);
        process.exit(0);
    }

    throw new Error(`Unknown subcommand: ${command}`);
} catch (error) {
    exitWithError(error);
}
