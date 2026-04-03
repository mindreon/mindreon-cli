import process from "node:process";
import { parseArgs } from "../cli/args.js";
import {
    ensureGitIdentity,
    getCurrentBranch,
    planTrackingPaths,
    pullWorkspace,
    readWorkspaceConfig,
    refreshWorkspaceCredentials,
    refreshWorkspaceGitRemote,
    syncWorkspaceBranch,
} from "../utils/workspace.js";
import { runCommand, captureCommand, tryCommand } from "../utils/shell.js";
import { runInstall } from "./install.js";

function getRepoRoot() {
    return captureCommand("git", ["rev-parse", "--show-toplevel"]);
}

export async function runRepo({ argv }) {
    const args = parseArgs(argv);
    const subCommand = args._[0];

    if (subCommand === "install") {
        await runInstall({ argv: argv.slice(1) });
        return;
    }

    const cwd = getRepoRoot();

    if (subCommand === "status") {
        const config = await readWorkspaceConfig(cwd);
        console.log(`Repo root: ${cwd}`);
        if (config.fvc?.fvs_id) {
            console.log(`FVS ID: ${config.fvc.fvs_id}`);
        }
        if (config.fvc?.bind_type && config.fvc?.bind_name) {
            console.log(`Binding: ${config.fvc.bind_type} ${config.fvc.bind_name}`);
        }
        if (config.fvc?.version) {
            console.log(`Version: ${config.fvc.version}`);
        }
        console.log("\nGit status:");
        runCommand("git", ["status", "--short"], { cwd });
        if (tryCommand("dvc", ["version"], { cwd }).status === 0) {
            console.log("\nDVC status:");
            const dvcStatus = tryCommand("dvc", ["status"], { cwd });
            if ((dvcStatus.stdout || "").trim()) {
                process.stdout.write(dvcStatus.stdout);
            }
            if (dvcStatus.status !== 0) {
                const message = (dvcStatus.stderr || "").trim() || "DVC status unavailable in the current directory.";
                console.log(message);
            }
        }
        return;
    }

    if (subCommand === "pull") {
        console.log("Refreshing Git remote token...");
        console.log("Syncing Git metadata...");
        console.log("Refreshing workspace credentials...");
        console.log("Pulling DVC data...");
        await pullWorkspace(cwd);
        return;
    }

    if (subCommand === "add") {
        const thresholdMb = args.threshold || args.thresholdMb || process.env.MINDREON_DVC_THRESHOLD_MB || "";
        const fileCountThreshold =
            args["count-threshold"] ||
            args.countThreshold ||
            args["file-count-threshold"] ||
            args.fileCountThreshold ||
            process.env.MINDREON_DVC_FILE_COUNT_THRESHOLD ||
            "";
        const explicitPaths = args._.slice(1);
        const {
            candidatePaths,
            dvcPaths,
            directoryDvcPaths,
            fileDvcPaths,
            thresholdMb: resolvedThresholdMb,
            fileCountThreshold: resolvedFileCountThreshold,
        } = await planTrackingPaths(cwd, explicitPaths, {
            thresholdMb,
            fileCountThreshold,
        });

        for (const filePath of dvcPaths) {
            runCommand("dvc", ["add", filePath], { cwd });
        }

        const gitAddArgs = explicitPaths.length > 0 ? ["add", "-A", "--", ...explicitPaths] : ["add", "-A"];
        runCommand("git", gitAddArgs, { cwd });
        const directoryLabel = directoryDvcPaths.length === 1 ? "directory" : "directories";
        console.log(
            `Tracked ${candidatePaths.length} file(s). ${directoryDvcPaths.length} ${directoryLabel} exceeded the ${resolvedFileCountThreshold} file threshold and ${fileDvcPaths.length} file(s) exceeded ${resolvedThresholdMb} MiB; ${dvcPaths.length} path(s) were added via DVC.`
        );
        return;
    }

    if (subCommand === "commit") {
        const message = args.message || args.m;
        if (!message) {
            throw new Error("Usage: mindreon repo commit -m <message>");
        }
        await ensureGitIdentity(cwd);
        runCommand("git", ["commit", "-m", message], { cwd });
        return;
    }

    if (subCommand === "push") {
        console.log("Refreshing Git remote token...");
        await refreshWorkspaceGitRemote(cwd);
        console.log("Refreshing workspace credentials...");
        await refreshWorkspaceCredentials(cwd);
        console.log("Syncing Git metadata...");
        const currentBranch = getCurrentBranch(cwd);
        const resolvedBranch = syncWorkspaceBranch(cwd, currentBranch);
        console.log("Pushing DVC data...");
        runCommand("dvc", ["push"], { cwd });

        const upstream = tryCommand("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], { cwd });
        if (upstream.status === 0) {
            console.log("Pushing Git metadata...");
            runCommand("git", ["push"], { cwd });
            return;
        }

        const pushBranch = resolvedBranch || getCurrentBranch(cwd);
        if (!pushBranch) {
            throw new Error("Unable to determine current Git branch for push.");
        }
        console.log("Pushing Git metadata and setting upstream...");
        runCommand("git", ["push", "-u", "origin", `HEAD:${pushBranch}`], { cwd });
        return;
    }

    throw new Error(`Unknown repo command: ${subCommand}`);
}
