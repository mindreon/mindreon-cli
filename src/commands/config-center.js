import { parseArgs } from "../cli/args.js";
import { request, resolveBaseUrl } from "../api/client.js";
import { loadConfig } from "../cli/config.js";
import { getServicePrefix, resolveServiceBaseUrl } from "../utils/routes.js";

function createAiNexusClient(config) {
    const baseUrl = resolveServiceBaseUrl("ai-nexus", config) || resolveBaseUrl(config);
    const prefix = getServicePrefix("ai-nexus", baseUrl);
    return { baseUrl, prefix };
}

async function existsConfigCenterResource(kind, args) {
    const name = String(args.name || "").trim();
    const source = String(args.source || "").trim();
    if (!name) {
        throw new Error("--name is required.");
    }
    if (source && !["custom", "preset"].includes(source)) {
        throw new Error('--source must be "custom" or "preset".');
    }

    const path = kind === "runtime-config" ? "/api/v1/runtime-configs/exists" : "/api/v1/parameter-templates/exists";
    const params = new URLSearchParams({ name });
    if (source) {
        params.set("source", source);
    }

    const config = await loadConfig();
    const { baseUrl, prefix } = createAiNexusClient(config);
    const response = await request(`${prefix}${path}?${params.toString()}`, {
        method: "GET",
        baseUrl,
    });
    const data = response?.data || response;
    if (data?.exists === true) {
        console.log(`${kind} ${name} exists`);
        return true;
    }

    const error = new Error(`${kind} ${name} not found`);
    error.exitCode = 2;
    throw error;
}

function apiPathForKind(kind) {
    if (kind === "runtime-config") return "/api/v1/runtime-configs";
    if (kind === "parameter-template") return "/api/v1/parameter-templates";
    throw new Error(`Unsupported config center resource kind: ${kind}`);
}

export async function createConfigCenterResource(kind, body) {
    const name = String(body?.name || "").trim();
    if (!name) {
        throw new Error(`${kind} name is required.`);
    }
    const config = await loadConfig();
    const { baseUrl, prefix } = createAiNexusClient(config);
    const response = await request(`${prefix}${apiPathForKind(kind)}`, {
        method: "POST",
        baseUrl,
        body,
    });
    console.log(`${kind} ${name} created`);
    return response?.data || response;
}

export async function runRuntimeConfig({ argv }) {
    const args = parseArgs(argv);
    const subCommand = args._[0] || "";

    if (subCommand === "exists") {
        return existsConfigCenterResource("runtime-config", parseArgs(argv.slice(1)));
    }
    if (subCommand === "create") {
        const body = JSON.parse(String(parseArgs(argv.slice(1)).body || "{}"));
        return createConfigCenterResource("runtime-config", body);
    }

    throw new Error(`Unknown runtime-config command: ${subCommand}`);
}

export async function runParameterTemplate({ argv }) {
    const args = parseArgs(argv);
    const subCommand = args._[0] || "";

    if (subCommand === "exists") {
        return existsConfigCenterResource("parameter-template", parseArgs(argv.slice(1)));
    }
    if (subCommand === "create") {
        const body = JSON.parse(String(parseArgs(argv.slice(1)).body || "{}"));
        return createConfigCenterResource("parameter-template", body);
    }

    throw new Error(`Unknown parameter-template command: ${subCommand}`);
}
