import { parseArgs } from "../cli/args.js";
import { request, resolveBaseUrl } from "../api/client.js";
import { loadConfig } from "../cli/config.js";
import { getServicePrefix } from "../utils/routes.js";
import { resolveResourceTarget } from "../utils/resource-target.js";
import { lookupFvs, waitForRepoReady } from "../utils/fvm.js";

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

async function getApiPrefixes() {
    const baseUrl = resolveBaseUrl(await loadConfig());
    return {
        dataset: getServicePrefix("dataset", baseUrl),
        model: getServicePrefix("model", baseUrl),
    };
}

async function createResource(args, resourceTarget) {
    const apiPrefixes = await getApiPrefixes();
    const displayName = args.displayName || resourceTarget.resourceName;
    const description = args.description || "";

    if (resourceTarget.resourceType === "model") {
        const source = normalizeModelSourceArg(args.source);
        console.log(`Creating model: ${resourceTarget.resourceName}`);
        const response = await request(`${apiPrefixes.model}/api/v1/models`, {
            method: "POST",
            body: {
                name: resourceTarget.resourceName,
                displayName,
                description,
                ...(source ? { source } : {}),
            },
        });

        console.log("Model created successfully.");
        console.log(response.data || response);
        console.log("Next steps:");
        console.log(`  mindreon create version --model "${resourceTarget.resourceName}" --version "main"`);
        console.log(`  mindreon connect --model "${resourceTarget.resourceName}" --version "main"`);
        return;
    }

    console.log(`Creating dataset: ${resourceTarget.resourceName}`);
    const response = await request(`${apiPrefixes.dataset}/api/v1/datasets`, {
        method: "POST",
        body: {
            name: resourceTarget.resourceName,
            displayName,
            description,
        },
    });

    console.log("Dataset created successfully.");
    console.log(response.data || response);
    console.log("Next steps:");
    console.log(`  mindreon create version --dataset "${resourceTarget.resourceName}" --version "main" --base "main"`);
    console.log(`  mindreon connect --dataset "${resourceTarget.resourceName}" --version "main"`);
}

async function createResourceVersion(args, resourceTarget) {
    const apiPrefixes = await getApiPrefixes();
    const version = String(args.version || "").trim();
    const baseBranch = String(args.base || args.baseBranch || "").trim();

    if (!version) {
        throw new Error("Usage: mindreon create version (--model <name> | --dataset <name>) --version <version> [--base <branch>]");
    }

    const fvsInfo = await lookupFvs(resourceTarget.resourceType, resourceTarget.resourceName);
    const fvsId = fvsInfo.id || fvsInfo.fvsId || fvsInfo.repoId;
    if (!fvsId) {
        throw new Error(`Unable to resolve FVS for ${resourceTarget.resourceType} '${resourceTarget.resourceName}'.`);
    }
    await waitForRepoReady(fvsId, {
        label: `${resourceTarget.resourceType} '${resourceTarget.resourceName}'`,
    });

    if (resourceTarget.resourceType === "model") {
        console.log(`Creating version ${version} for model ${resourceTarget.resourceName}`);
        const response = await request(`${apiPrefixes.model}/api/v1/models/${resourceTarget.resourceName}/versions`, {
            method: "POST",
            body: {
                branch: version,
                ...(baseBranch ? { baseBranch } : {}),
            },
        });

        console.log("Model version created successfully.");
        console.log(response.data || response);
        console.log("Next steps:");
        console.log(`  mindreon connect --model "${resourceTarget.resourceName}" --version "${version}"`);
        return;
    }

    const resolvedBaseBranch = baseBranch || "main";
    console.log(`Creating version ${version} for dataset ${resourceTarget.resourceName}`);
    const response = await request(`${apiPrefixes.dataset}/api/v1/datasets/${resourceTarget.resourceName}/versions`, {
        method: "POST",
        body: {
            newBranch: version,
            baseBranch: resolvedBaseBranch,
        },
    });

    console.log("Dataset version created successfully.");
    console.log(response.data || response);
    console.log("Next steps:");
    console.log(`  mindreon connect --dataset "${resourceTarget.resourceName}" --version "${version}"`);
}

export async function runCreate({ argv }) {
    const args = parseArgs(argv);
    const subCommand = args._[0];
    const resourceTarget = resolveResourceTarget(args);

    if (!subCommand) {
        await createResource(args, resourceTarget);
        return;
    }

    if (subCommand === "version") {
        await createResourceVersion(args, resourceTarget);
        return;
    }

    throw new Error(`Unknown create command: ${subCommand}`);
}
