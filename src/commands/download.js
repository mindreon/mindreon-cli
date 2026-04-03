import path from "node:path";
import { parseArgs } from "../cli/args.js";
import { downloadWorkspace } from "../utils/workspace.js";
import { resolveResourceTarget } from "../utils/resource-target.js";

export async function runDownload({ argv }) {
    const args = parseArgs(argv);
    const subCommand = args._[0];
    if (subCommand) {
        throw new Error(`Unknown download command: ${subCommand}`);
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
