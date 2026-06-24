import path from "node:path";
import { parseArgs } from "../cli/args.js";
import { downloadWorkspace } from "../utils/workspace.js";
import { parseBatchItems, resolveResourceTarget, sanitizeResourceDirName } from "../utils/resource-target.js";

function firstNonEmpty(...values) {
    for (const value of values) {
        const normalized = String(value || "").trim();
        if (normalized) return normalized;
    }
    return "";
}

function buildBatchTargets(args, env = process.env) {
    const specs = [
        {
            resourceType: "model",
            rootSubdir: "models",
            raw: firstNonEmpty(args.models, env.FVC_MODELS, env.MINDREON_MODELS),
        },
        {
            resourceType: "dataset",
            rootSubdir: "datasets",
            raw: firstNonEmpty(args.datasets, env.FVC_DATASETS, env.MINDREON_DATASETS),
        },
        {
            resourceType: "workload",
            rootSubdir: "workloads",
            raw: firstNonEmpty(args.workloads, env.FVC_WORKLOADS, env.MINDREON_WORKLOADS),
        },
    ];
    const targets = [];
    for (const spec of specs) {
        for (const item of parseBatchItems(spec.raw)) {
            targets.push({
                resourceType: spec.resourceType,
                resourceName: item.name,
                version: item.version,
                rootSubdir: spec.rootSubdir,
            });
        }
    }
    return targets;
}

function hasBatchDownloadArgs(args, env = process.env) {
    return Boolean(
        args.models ||
            args.datasets ||
            args.workloads ||
            env.FVC_MODELS ||
            env.FVC_DATASETS ||
            env.FVC_WORKLOADS ||
            env.MINDREON_MODELS ||
            env.MINDREON_DATASETS ||
            env.MINDREON_WORKLOADS
    );
}

async function runBatchDownload(args, env) {
    const rootDir = path.resolve(firstNonEmpty(args["root-dir"], args.rootDir, env.FVC_ROOT_DIR, env.MINDREON_ROOT_DIR) || "/data/resources");
    const targets = buildBatchTargets(args, env);
    if (targets.length === 0) {
        throw new Error("At least one of --models, --datasets, or --workloads must be specified.");
    }

    const failed = [];
    let succeeded = 0;
    console.log(`Batch downloading ${targets.length} resource(s) into ${rootDir}...`);
    for (const target of targets) {
        const targetDir = path.join(rootDir, target.rootSubdir, sanitizeResourceDirName(target.resourceName));
        const label = `${target.resourceType} ${target.resourceName}${target.version ? `@${target.version}` : ""}`;
        try {
            console.log(`Downloading ${label} into ${targetDir}...`);
            await downloadWorkspace({
                cwd: targetDir,
                bindType: target.resourceType,
                bindName: target.resourceName,
                version: target.version,
            });
            succeeded++;
        } catch (error) {
            failed.push({ label, error: error?.message || String(error) });
            console.error(`Failed: ${label}: ${error?.message || String(error)}`);
        }
    }

    if (failed.length > 0) {
        const details = failed.map((item) => `${item.label}: ${item.error}`).join("; ");
        throw new Error(`Batch download completed with errors: ${succeeded}/${targets.length} succeeded. ${details}`);
    }
    console.log(`Batch downloaded successfully. ${succeeded}/${targets.length} succeeded.`);
}

export const __test = {
    buildBatchTargets,
    hasBatchDownloadArgs,
};

export async function runDownload({ argv, env = process.env }) {
    const args = parseArgs(argv);
    const subCommand = args._[0];
    if (subCommand) {
        throw new Error(`Unknown download command: ${subCommand}`);
    }

    if (hasBatchDownloadArgs(args, env)) {
        await runBatchDownload(args, env);
        return;
    }

    const resourceTarget = resolveResourceTarget(args);
    const version = String(args.version || args.branch || "").trim();
    const targetDir = path.resolve(args.dir || path.join(process.cwd(), resourceTarget.resourceName));

    console.log(
        `Downloading ${resourceTarget.resourceType} workspace ${resourceTarget.resourceName}${version ? `@${version}` : ""} into ${targetDir}...`
    );
    const result = await downloadWorkspace({
        cwd: targetDir,
        bindType: resourceTarget.resourceType,
        bindName: resourceTarget.resourceName,
        version,
    });
    console.log(`Downloaded successfully. FVS ID: ${result.fvsId}`);
    console.log(`Current version: ${result.branch}`);
    console.log(`Workspace directory: ${targetDir}`);
}
