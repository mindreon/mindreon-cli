import { parseArgs } from "../cli/args.js";
import { request, resolveBaseUrl } from "../api/client.js";
import { connectWorkspace } from "../utils/workspace.js";
import { loadConfig } from "../cli/config.js";
import { getServicePrefix } from "../utils/routes.js";

export async function runDataset({ argv }) {
    const args = parseArgs(argv);
    const subCommand = args._[0];
    const nestedCommand = args._[1];
    const apiPrefix = getServicePrefix("dataset", resolveBaseUrl(await loadConfig()));

    if (subCommand === "create") {
        const name = args.name;
        const displayName = args.displayName || name;
        const description = args.description || "";

        if (!name) {
            throw new Error("Usage: mindreon-mcp dataset create --name <name> [--displayName <name>] [--description <desc>]");
        }

        console.log(`Creating dataset: ${name}`);
        const response = await request(`${apiPrefix}/api/v1/datasets`, {
            method: "POST",
            body: { name, displayName, description },
        });

        // Dataset service responds with standard wrapped or direct. Assumed wrapped parsed in client.js
        console.log("Dataset created successfully.");
        console.log(response.data || response);
        return;
    }

    if ((subCommand === "version" && nestedCommand === "create") || subCommand === "create-version") {
        const datasetName = args.name || args.dataset;
        const version = args.version;
        const baseBranch = args.base || args.baseBranch || "main";

        if (!datasetName || !version) {
            throw new Error("Usage: mindreon-mcp dataset version create --name <name> --version <version> [--base <branch>]");
        }

        console.log(`Creating version ${version} for dataset ${datasetName}`);
        const response = await request(`${apiPrefix}/api/v1/datasets/${datasetName}/versions`, {
            method: "POST",
            body: {
                newBranch: version,
                baseBranch,
            },
        });

        console.log("Dataset version created successfully.");
        console.log(response.data || response);
        return;
    }

    if (subCommand === "connect") {
        const datasetName = args.name || args.dataset;
        const version = args.version || args.branch || "";

        if (!datasetName) {
            throw new Error("Usage: mindreon-mcp dataset connect --name <name> [--version <version>]");
        }

        console.log(`Connecting current directory to dataset ${datasetName}${version ? `@${version}` : ""}...`);
        const result = await connectWorkspace({
            cwd: process.cwd(),
            bindType: "dataset",
            bindName: datasetName,
            version,
        });
        console.log(`Connected successfully. FVS ID: ${result.fvsId}`);
        console.log(`Current version: ${result.branch}`);
        return;
    }

    throw new Error(`Unknown dataset command: ${subCommand}`);
}
