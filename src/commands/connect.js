import path from "node:path";
import { parseArgs } from "../cli/args.js";
import { connectWorkspace } from "../utils/workspace.js";
import { resolveResourceTarget } from "../utils/resource-target.js";

export async function runConnect({ argv }) {
    const args = parseArgs(argv);
    const subCommand = args._[0];
    if (subCommand) {
        throw new Error(`Unknown connect command: ${subCommand}`);
    }

    const resourceTarget = resolveResourceTarget(args);
    const version = String(args.version || args.branch || "").trim();
    const targetDir = path.resolve(args.dir || path.join(process.cwd(), resourceTarget.resourceName));

    console.log(
        `Initializing ${resourceTarget.resourceType} workspace ${resourceTarget.resourceName}${version ? `@${version}` : ""} in ${targetDir}...`
    );
    const result = await connectWorkspace({
        cwd: targetDir,
        bindType: resourceTarget.resourceType,
        bindName: resourceTarget.resourceName,
        version,
    });
    console.log(`Connected successfully. FVS ID: ${result.fvsId}`);
    console.log(`Current version: ${result.branch}`);
    console.log("Next steps:");
    console.log(`  cd ${targetDir}`);
    console.log("  mindreon repo pull");
}
