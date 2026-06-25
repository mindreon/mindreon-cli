import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parseArgs } from "../cli/args.js";
import { resolveResourceTarget } from "../utils/resource-target.js";
import { connectWorkspace } from "../utils/workspace.js";
import { tryCommand } from "../utils/shell.js";
import { runRepo } from "./repo.js";

function resolveVersion(args) {
    return String(args.version || args.branch || args.b || "main").trim() || "main";
}

async function runRepoInWorkspace(workspaceDir, argv) {
    const originalCwd = process.cwd();
    process.chdir(workspaceDir);
    try {
        await runRepo({ argv });
    } finally {
        process.chdir(originalCwd);
    }
}

function hasGitChanges(workspaceDir) {
    const status = tryCommand("git", ["status", "--porcelain"], { cwd: workspaceDir });
    return status.status === 0 && String(status.stdout || "").trim() !== "";
}

export async function runPublish({ argv }) {
    const args = parseArgs(argv);
    const subCommand = args._[0];
    if (subCommand) {
        throw new Error(`Unknown publish command: ${subCommand}`);
    }

    const workspaceDir = path.resolve(args.dir || process.cwd());
    const workspaceStat = await fs.stat(workspaceDir).catch(() => null);
    if (!workspaceStat?.isDirectory()) {
        throw new Error(`Publish workspace directory does not exist: ${workspaceDir}`);
    }

    const target = resolveResourceTarget(args);
    if (target.resourceType !== "model" && target.resourceType !== "dataset") {
        throw new Error("Usage: mindreon publish --dir <path> (--model <name> | --dataset <name>) [--version <version>]");
    }

    const version = resolveVersion(args);
    const threshold = String(args.threshold || args.thresholdMb || process.env.FVC_PUBLISH_DVC_THRESHOLD_MB || "5").trim();
    const message = args.message || args.m || `Auto publish ${target.resourceType} ${target.resourceName}:${version}`;

    console.log(`Publishing ${target.resourceType} ${target.resourceName}@${version} from ${workspaceDir}...`);
    await connectWorkspace({
        cwd: workspaceDir,
        bindType: target.resourceType,
        bindName: target.resourceName,
        version,
    });

    await runRepoInWorkspace(workspaceDir, ["add", "--threshold", threshold]);

    if (!hasGitChanges(workspaceDir)) {
        console.log("No changes to publish.");
        return;
    }

    await runRepoInWorkspace(workspaceDir, ["commit", "-m", message]);
    await runRepoInWorkspace(workspaceDir, ["push"]);
    console.log("Publish completed.");
}

export const __test = {
    resolveVersion,
};
