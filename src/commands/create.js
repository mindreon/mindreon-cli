import { parseArgs } from "../cli/args.js";
import { request, resolveBaseUrl } from "../api/client.js";
import { loadConfig } from "../cli/config.js";
import { getServicePrefix, resolveServiceBaseUrl } from "../utils/routes.js";
import { resolveResourceTarget } from "../utils/resource-target.js";
import { lookupFvs, waitForRepoReady } from "../utils/fvm.js";

function normalizeResourceSourceArg(args, resourceType) {
    const raw = args.source || "";
    const preset = args.preset === true || String(args.preset).toLowerCase() === "true";
    const sourceMap = new Map([
        ["custom", "custom"],
        ["pageupload", "custom"],
        ["preset", "preset"],
        ["taskpublish", "taskPublish"],
    ]);

    let normalized = sourceMap.get(String(raw).trim().toLowerCase()) || "";
    if (raw && !normalized) {
        const supported = resourceType === "model" ? "custom, preset, taskPublish" : "custom, preset";
        throw new Error(`Unsupported ${resourceType} source. Use one of: ${supported}`);
    }
    if (resourceType === "dataset" && normalized === "taskPublish") {
        throw new Error("Unsupported dataset source. Use one of: custom, preset");
    }
    if (preset && normalized && normalized !== "preset") {
        throw new Error("--preset conflicts with --source. Use --preset or --source preset, not both.");
    }
    if (preset) {
        normalized = "preset";
    }
    if (!normalized) {
        normalized = "custom";
    }
    return normalized;
}

async function getApiContexts() {
    const config = await loadConfig();
    const defaultBaseUrl = resolveBaseUrl(config);
    const datasetBaseUrl = resolveServiceBaseUrl("dataset", config) || defaultBaseUrl;
    const modelBaseUrl = resolveServiceBaseUrl("model", config) || defaultBaseUrl;
    return {
        dataset: {
            baseUrl: datasetBaseUrl,
            prefix: getServicePrefix("dataset", datasetBaseUrl),
        },
        model: {
            baseUrl: modelBaseUrl,
            prefix: getServicePrefix("model", modelBaseUrl),
        },
    };
}

async function createResource(args, resourceTarget) {
    const apiContexts = await getApiContexts();
    const displayName = args.displayName || resourceTarget.resourceName;
    const description = args.description || "";

    if (resourceTarget.resourceType === "model") {
        const context = apiContexts.model;
        const source = normalizeResourceSourceArg(args, resourceTarget.resourceType);
        console.log(`Creating model: ${resourceTarget.resourceName}`);
        const response = await request(`${context.prefix}/api/v1/models`, {
            method: "POST",
            baseUrl: context.baseUrl,
            body: {
                name: resourceTarget.resourceName,
                displayName,
                description,
                source,
            },
        });

        console.log("Model created successfully.");
        console.log(response.data || response);
        console.log("Next steps:");
        console.log(`  mindreon connect --model "${resourceTarget.resourceName}" --version "main"`);
        console.log("  # add files, then run: mindreon repo add && mindreon repo commit -m \"initial import\" && mindreon repo push");
        return;
    }

    const context = apiContexts.dataset;
    const source = normalizeResourceSourceArg(args, resourceTarget.resourceType);
    console.log(`Creating dataset: ${resourceTarget.resourceName}`);
    const response = await request(`${context.prefix}/api/v1/datasets`, {
        method: "POST",
        baseUrl: context.baseUrl,
        body: {
            name: resourceTarget.resourceName,
            displayName,
            description,
            source,
        },
    });

    console.log("Dataset created successfully.");
    console.log(response.data || response);
    console.log("Next steps:");
    console.log(`  mindreon connect --dataset "${resourceTarget.resourceName}" --version "main"`);
    console.log("  # add files, then run: mindreon repo add && mindreon repo commit -m \"initial import\" && mindreon repo push");
}

async function createResourceVersion(args, resourceTarget) {
    const apiContexts = await getApiContexts();
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

    if (version === "main") {
        console.log(`${resourceTarget.resourceType} ${resourceTarget.resourceName} already has initial version "main".`);
        console.log("Next steps:");
        console.log(`  mindreon connect --${resourceTarget.resourceType} "${resourceTarget.resourceName}" --version "main"`);
        return;
    }

    if (resourceTarget.resourceType === "model") {
        const context = apiContexts.model;
        console.log(`Creating version ${version} for model ${resourceTarget.resourceName}`);
        const response = await request(`${context.prefix}/api/v1/models/${resourceTarget.resourceName}/versions`, {
            method: "POST",
            baseUrl: context.baseUrl,
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

    const context = apiContexts.dataset;
    const resolvedBaseBranch = baseBranch || "main";
    console.log(`Creating version ${version} for dataset ${resourceTarget.resourceName}`);
    const response = await request(`${context.prefix}/api/v1/datasets/${resourceTarget.resourceName}/versions`, {
        method: "POST",
        baseUrl: context.baseUrl,
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
