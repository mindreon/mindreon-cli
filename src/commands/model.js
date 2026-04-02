import { parseArgs } from "../cli/args.js";
import path from "node:path";
import { request, resolveBaseUrl } from "../api/client.js";
import { connectWorkspace } from "../utils/workspace.js";
import { loadConfig } from "../cli/config.js";
import { getServicePrefix } from "../utils/routes.js";

export async function runModel({ argv }) {
    const args = parseArgs(argv);
    const subCommand = args._[0];
    const nestedCommand = args._[1];
    const apiPrefix = getServicePrefix("model", resolveBaseUrl(await loadConfig()));

    if (subCommand === "create") {
        const name = args.name;
        const displayName = args.displayName || name;
        const description = args.description || "";
        const source = normalizeModelSourceArg(args.source);

        if (!name) {
            throw new Error("Usage: mindreon model create --name <name> [--displayName <name>] [--description <desc>] [--source <pageUpload|preset|taskPublish>]");
        }

        console.log(`Creating model: ${name}`);
        const response = await request(`${apiPrefix}/api/v1/models`, {
            method: "POST",
            body: {
                name,
                displayName,
                description,
                ...(source ? { source } : {}),
            },
        });

        console.log("Model created successfully.");
        console.log(response.data || response);
        console.log("Next steps:");
        console.log(`  mindreon model version create --name "${name}" --version "main"`);
        console.log(`  mindreon model connect --name "${name}" --version "main"`);
        return;
    }

    if ((subCommand === "version" && nestedCommand === "create") || subCommand === "create-version") {
        const modelName = args.name || args.model;
        const version = args.version;
        const baseBranch = args.base || args.baseBranch || "";

        if (!modelName || !version) {
            throw new Error("Usage: mindreon model version create --name <name> --version <version> [--base <branch>]");
        }

        console.log(`Creating version ${version} for model ${modelName}`);
        const response = await request(`${apiPrefix}/api/v1/models/${modelName}/versions`, {
            method: "POST",
            body: {
                branch: version,
                ...(baseBranch ? { baseBranch } : {}),
            },
        });

        console.log("Model version created successfully.");
        console.log(response.data || response);
        console.log("Next steps:");
        console.log(`  mindreon model connect --name "${modelName}" --version "${version}"`);
        return;
    }

    if (subCommand === "connect") {
        const modelName = normalizeEntityName(args, "model");
        const version = args.version || args.branch || "";
        const targetDir = path.resolve(args.dir || path.join(process.cwd(), modelName));

        if (!modelName) {
            throw new Error("Usage: mindreon model connect --name <name> [--version <version>] [--dir <path>]");
        }

        console.log(`Initializing model workspace ${modelName}${version ? `@${version}` : ""} in ${targetDir}...`);
        const result = await connectWorkspace({
            cwd: targetDir,
            bindType: "model",
            bindName: modelName,
            version,
        });
        console.log(`Connected successfully. FVS ID: ${result.fvsId}`);
        console.log(`Current version: ${result.branch}`);
        console.log("Next steps:");
        console.log(`  cd ${targetDir}`);
        console.log("  mindreon repo pull");
        return;
    }

    throw new Error(`Unknown model command: ${subCommand}`);
}

function normalizeEntityName(args, legacyKey) {
    return args.name || args[legacyKey] || "";
}

function normalizeModelSourceArg(raw) {
    if (!raw) {
        return "";
    }

    const sourceMap = new Map([
        ["pageupload", "pageUpload"],
        ["preset", "preset"],
        ["taskpublish", "taskPublish"],
    ]);
    const normalized = sourceMap.get(String(raw).trim().toLowerCase());
    if (!normalized) {
        throw new Error("Unsupported model source. Use one of: pageUpload, preset, taskPublish");
    }
    return normalized;
}
