import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { parseArgs } from "../cli/args.js";
import { request, resolveBaseUrl } from "../api/client.js";
import { loadConfig, saveConfig } from "../cli/config.js";
import { getServicePrefix, resolveServiceBaseUrl } from "../utils/routes.js";
import { connectWorkspace, ensureGitIdentity, planTrackingPaths, syncWorkspaceBranch } from "../utils/workspace.js";
import { runCommand, tryCommand } from "../utils/shell.js";
import { runDvc } from "../utils/dvc.js";
import { createConfigCenterResource } from "./config-center.js";
import { runImage } from "./image.js";

const SUPPORTED_SOURCES = new Set(["modelscope", "huggingface", "hf"]);
const DEFAULT_RESOURCES_DIR = "/resources";
const DEFAULT_DVC_THRESHOLD_MB = "5";
const DEFAULT_DVC_FILE_COUNT_THRESHOLD = "1000";

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function cleanList(values) {
    return asArray(values).map((value) => String(value).trim()).filter(Boolean);
}

function firstNonEmpty(...values) {
    for (const value of values) {
        const normalized = String(value || "").trim();
        if (normalized) return normalized;
    }
    return "";
}

function absPath(resourcesDir, value) {
    const normalized = String(value || "").trim();
    if (!normalized || path.isAbsolute(normalized)) return normalized;
    return path.join(resourcesDir, normalized);
}

async function readYaml(file) {
    const data = await fs.readFile(file, "utf-8");
    return YAML.parse(data) || {};
}

async function seedFiles(dir) {
    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
    }
    return entries
        .filter((entry) => entry.isFile() && !entry.name.startsWith(".") && [".yaml", ".yml"].includes(path.extname(entry.name).toLowerCase()))
        .map((entry) => path.join(dir, entry.name))
        .sort();
}

function mergeSeed(target, source) {
    target.models.push(...asArray(source.models));
    target.datasets.push(...asArray(source.datasets));
    target.images.push(...asArray(source.images));
    target.runtimeConfigs.push(...asArray(source.runtimeConfigs));
    target.parameterTemplates.push(...asArray(source.parameterTemplates));
}

export async function loadSeedConfig(configFile, env = process.env) {
    const configPath = path.resolve(configFile || "configs/config.yaml");
    const configDir = path.dirname(configPath);
    const raw = await readYaml(configPath);
    const cfg = {
        resourcesDir: firstNonEmpty(env.PLATFORM_SEED_RESOURCES_DIR, raw.resourcesDir, DEFAULT_RESOURCES_DIR),
        seedDirs: asArray(raw.seedDirs),
        dvcThresholdMb: firstNonEmpty(raw.dvcThresholdMb, DEFAULT_DVC_THRESHOLD_MB),
        dvcFileCountThreshold: firstNonEmpty(raw.dvcFileCountThreshold, DEFAULT_DVC_FILE_COUNT_THRESHOLD),
        mindreonApiUrl: firstNonEmpty(raw.mindreonApiUrl),
        modelServiceUrl: firstNonEmpty(raw.modelServiceUrl),
        datasetServiceUrl: firstNonEmpty(raw.datasetServiceUrl),
        imageServiceUrl: firstNonEmpty(raw.imageServiceUrl),
        fvmUrl: firstNonEmpty(raw.fvmUrl),
        iamServiceUrl: firstNonEmpty(raw.iamServiceUrl),
        aiNexusUrl: firstNonEmpty(raw.aiNexusUrl),
        authToken: firstNonEmpty(env.MINDREON_AUTH_TOKEN, raw.authToken),
        authUsername: firstNonEmpty(env.MINDREON_AUTH_USERNAME, raw.authUsername),
        authPassword: firstNonEmpty(env.MINDREON_AUTH_PASSWORD, raw.authPassword),
        models: asArray(raw.models),
        datasets: asArray(raw.datasets),
        images: asArray(raw.images),
        runtimeConfigs: asArray(raw.runtimeConfigs),
        parameterTemplates: asArray(raw.parameterTemplates),
    };

    const seedDirsEnv = String(env.PLATFORM_SEED_DIRS || "").trim();
    if (seedDirsEnv) {
        cfg.seedDirs = seedDirsEnv.split(/[,:]/).map((item) => item.trim()).filter(Boolean);
    }

    for (const seedDir of cfg.seedDirs) {
        const dir = path.isAbsolute(seedDir) ? seedDir : path.join(configDir, seedDir);
        for (const file of await seedFiles(dir)) {
            mergeSeed(cfg, await readYaml(file));
        }
    }
    return cfg;
}

function stripApiV1(value) {
    return String(value || "").trim().replace(/\/+$/, "").replace(/\/api\/v1$/i, "");
}

function applySeedEnv(cfg) {
    const setIfPresent = (key, value) => {
        const normalized = String(value || "").trim();
        if (normalized) {
            process.env[key] = normalized;
        }
    };
    setIfPresent("MINDREON_API_URL", cfg.mindreonApiUrl);
    setIfPresent("MINDREON_MODEL_URL", cfg.modelServiceUrl);
    setIfPresent("MINDREON_DATASET_URL", cfg.datasetServiceUrl);
    setIfPresent("MINDREON_IMAGE_URL", cfg.imageServiceUrl);
    setIfPresent("MINDREON_FVM_URL", cfg.fvmUrl);
    setIfPresent("MINDREON_IAM_URL", cfg.iamServiceUrl);
    setIfPresent("MINDREON_AI_NEXUS_URL", stripApiV1(cfg.aiNexusUrl));
    setIfPresent("MINDREON_AUTH_TOKEN", cfg.authToken);
    setIfPresent("MINDREON_SEED_RESOURCES_DIR", cfg.resourcesDir);
    if (!process.env.HF_HUB_ETAG_TIMEOUT) process.env.HF_HUB_ETAG_TIMEOUT = "20";
    if (!process.env.HF_HUB_DOWNLOAD_TIMEOUT) process.env.HF_HUB_DOWNLOAD_TIMEOUT = "20";
}

async function hasEntries(targetPath) {
    try {
        const entries = await fs.readdir(targetPath);
        return entries.length > 0;
    } catch {
        return false;
    }
}

async function pathExists(targetPath) {
    try {
        await fs.access(targetPath);
        return true;
    } catch {
        return false;
    }
}

function prepareTempPath(targetPath) {
    return path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.prepare`);
}

function resolvePrepareTargetPath(resourcesDir, resourceType, item) {
    if (item.prepare?.targetPath) {
        return absPath(resourcesDir, item.prepare.targetPath);
    }
    if (item.path) {
        return absPath(resourcesDir, item.path);
    }
    return path.join(resourcesDir, resourceType === "dataset" ? "datasets" : "models", item.name);
}

function buildPrepareCommand(resourceType, prepare, targetPath) {
    const source = String(prepare.source || "").trim().toLowerCase();
    if (!SUPPORTED_SOURCES.has(source)) {
        throw new Error(`unsupported prepare.source ${JSON.stringify(prepare.source)}`);
    }
    const type = firstNonEmpty(prepare.type, resourceType).toLowerCase();
    if (!["model", "dataset"].includes(type)) {
        throw new Error(`unsupported prepare.type ${JSON.stringify(prepare.type)}`);
    }
    const id = String(prepare.id || "").trim();
    if (!id) {
        throw new Error("prepare.id is required");
    }

    if (source === "modelscope") {
        if (asArray(prepare.exclude).length > 0) {
            throw new Error("modelscope prepare does not support exclude");
        }
        const args = ["download", type === "dataset" ? "--dataset" : "--model", id];
        if (prepare.revision) {
            args.push("--revision", String(prepare.revision).trim());
        }
        args.push(...cleanList(prepare.include), "--local_dir", targetPath);
        return { command: "modelscope", args };
    }

    const args = ["download", id];
    if (type === "dataset") {
        args.push("--repo-type", "dataset");
    }
    if (prepare.revision) {
        args.push("--revision", String(prepare.revision).trim());
    }
    for (const pattern of cleanList(prepare.include)) {
        args.push("--include", pattern);
    }
    for (const pattern of cleanList(prepare.exclude)) {
        args.push("--exclude", pattern);
    }
    args.push("--local-dir", targetPath);
    return { command: "hf", args };
}

async function replaceEmptyTarget(tempPath, targetPath) {
    if (await hasEntries(targetPath)) {
        throw new Error(`prepare target path is no longer empty: ${targetPath}`);
    }
    await fs.rm(targetPath, { recursive: true, force: true });
    await fs.rename(tempPath, targetPath);
}

function resultCell(value) {
    return String(value ?? "")
        .replace(/\r?\n/g, " ")
        .replace(/\|/g, "\\|")
        .trim();
}

function formatResultsTable(title, results) {
    const rows = [
        title,
        "| Stage | Type | Name | Status | Reason |",
        "| --- | --- | --- | --- | --- |",
        ...results.map((result) =>
            `| ${resultCell(result.stage)} | ${resultCell(result.type)} | ${resultCell(result.name)} | ${resultCell(result.status)} | ${resultCell(result.reason)} |`
        ),
    ];
    return rows.join("\n");
}

function printResultsTable(title, results) {
    console.log(formatResultsTable(title, results));
}

function failedResults(results) {
    return results.filter((result) => result.status === "failed");
}

function throwIfFailures(action, results) {
    const failures = failedResults(results);
    if (failures.length === 0) return;
    const details = failures.map((result) => `${result.stage}/${result.type}/${result.name}: ${result.reason}`).join("; ");
    throw new Error(`${action} completed with ${failures.length} failure(s): ${details}`);
}

async function runResourceJobs(stage, jobs) {
    const results = [];
    for (const job of jobs) {
        try {
            const outcome = (await job.handler()) || {};
            results.push({
                stage,
                type: job.type,
                name: job.name,
                status: outcome.status || "success",
                reason: outcome.reason || "",
            });
        } catch (error) {
            const reason = error.message || String(error);
            console.error(reason);
            results.push({
                stage,
                type: job.type,
                name: job.name,
                status: "failed",
                reason,
            });
        }
    }
    return results;
}

function isExistsError(error) {
    const text = `${error?.message || ""}\n${JSON.stringify(error?.data || {})}`.toLowerCase();
    return (
        error?.status === 409 ||
        text.includes("already exists") ||
        text.includes("duplicate") ||
        text.includes("已存在")
    );
}

async function prepareResource(resourcesDir, resourceType, item, { dryRun }) {
    const name = String(item.name || "").trim();
    if (!name) throw new Error(`${resourceType} name is required`);
    if (!item.prepare) {
        console.log(`skip prepare ${resourceType} ${name}: no prepare config`);
        return { status: "skipped", reason: "no prepare config" };
    }
    const targetPath = resolvePrepareTargetPath(resourcesDir, resourceType, item);
    if (await hasEntries(targetPath)) {
        console.log(`skip prepare ${resourceType} ${name}: target path already has content: ${targetPath}`);
        return { status: "skipped", reason: `target path already has content: ${targetPath}` };
    }
    const tempPath = prepareTempPath(targetPath);
    const prepareCmd = buildPrepareCommand(resourceType, item.prepare, tempPath);
    if (dryRun) {
        console.log(`[dry-run] prepare ${resourceType} ${name}: ${prepareCmd.command} ${prepareCmd.args.join(" ")}`);
        return { status: "success", reason: `dry-run would prepare to ${targetPath}` };
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.mkdir(tempPath, { recursive: true });
    console.log(`run prepare command: ${prepareCmd.command} ${prepareCmd.args.join(" ")}`);
    runCommand(prepareCmd.command, prepareCmd.args);
    if (!(await hasEntries(tempPath))) {
        throw new Error(`prepared resource is empty: ${tempPath}`);
    }
    await replaceEmptyTarget(tempPath, targetPath);
    return { status: "success", reason: `prepared to ${targetPath}` };
}

async function resolveSeedConfig(argv, env) {
    const args = parseArgs(argv || []);
    const cfg = await loadSeedConfig(args.config || args.c, env);
    if (args["resources-dir"]) {
        cfg.resourcesDir = args["resources-dir"];
    }
    return { args, cfg, dryRun: Boolean(args["dry-run"]) };
}

function prepareJobs(cfg, dryRun) {
    return [
        ...cfg.models.map((item) => ({
            type: "model",
            name: String(item.name || "").trim() || "<unnamed>",
            handler: () => prepareResource(cfg.resourcesDir, "model", item, { dryRun }),
        })),
        ...cfg.datasets.map((item) => ({
            type: "dataset",
            name: String(item.name || "").trim() || "<unnamed>",
            handler: () => prepareResource(cfg.resourcesDir, "dataset", item, { dryRun }),
        })),
    ];
}

async function executeSeedPrepare(cfg, { dryRun }) {
    return runResourceJobs("prepare", prepareJobs(cfg, dryRun));
}

export async function runSeedPrepare({ argv, env = process.env } = {}) {
    const { cfg, dryRun } = await resolveSeedConfig(argv, env);
    applySeedEnv(cfg);

    console.log(`mindreon seed prepare started resourcesDir=${cfg.resourcesDir}`);
    const results = await executeSeedPrepare(cfg, { dryRun });
    printResultsTable("mindreon seed prepare summary:", results);
    throwIfFailures("mindreon seed prepare", results);
    console.log("mindreon seed prepare completed");
}

async function ensureLogin(cfg, { dryRun }) {
    const username = String(cfg.authUsername || "").trim();
    const password = String(cfg.authPassword || "").trim();
    if (!username || !password) {
        return;
    }
    if (dryRun) {
        console.log(`[dry-run] login ${username}`);
        return;
    }
    const current = await loadConfig();
    if (current.token && current.username === username) {
        return;
    }
    console.log(`Logging in as ${username}...`);
    const configuredUrl = current.url || process.env.MINDREON_API_URL || "";
    const iamBaseUrl = resolveServiceBaseUrl("iam", current) || resolveBaseUrl(current);
    const iamPrefix = getServicePrefix("iam", iamBaseUrl);
    const response = await request(`${iamPrefix}/api/v1/auth/login`, {
        method: "POST",
        baseUrl: iamBaseUrl,
        skipAuth: true,
        body: { username, password },
    });
    const token =
        response?.data?.accessToken ||
        response?.data?.token ||
        response?.accessToken ||
        response?.token ||
        "";
    if (!token) {
        const payload = typeof response === "string" ? response : JSON.stringify(response, null, 2);
        throw new Error(`Invalid response format from login API:\n${payload}`);
    }
    if (configuredUrl) {
        await saveConfig({ url: configuredUrl, token, username, gitAccessToken: "" });
    } else {
        await saveConfig({ token, username, gitAccessToken: "" });
    }
    console.log(`Successfully logged in as ${username}. Token saved to config.`);
}

function createResourceClient(resourceType, config) {
    const baseUrl = resolveServiceBaseUrl(resourceType, config) || resolveBaseUrl(config);
    return {
        baseUrl,
        prefix: getServicePrefix(resourceType, baseUrl),
    };
}

async function createPresetResource(resourceType, item) {
    const name = String(item.name || "").trim();
    if (!name) throw new Error(`${resourceType} name is required`);
    const config = await loadConfig();
    const client = createResourceClient(resourceType, config);
    const endpoint = resourceType === "model" ? "/api/v1/models" : "/api/v1/datasets";
    console.log(`Creating ${resourceType}: ${name}`);
    let response;
    try {
        response = await request(`${client.prefix}${endpoint}`, {
            method: "POST",
            baseUrl: client.baseUrl,
            body: {
                name,
                displayName: firstNonEmpty(item.displayName, name),
                description: String(item.description || ""),
                source: "preset",
            },
        });
    } catch (error) {
        if (isExistsError(error)) {
            console.log(`skip existing ${resourceType} ${name}`);
            return null;
        }
        throw error;
    }
    console.log(`${resourceType} ${name} created`);
    return response?.data || response;
}

async function createResourceVersion(resourceType, name, version) {
    if (version === "main") {
        console.log(`skip create version ${resourceType} ${name}: main version metadata is created with resource; branch is created on first push`);
        return;
    }
    const config = await loadConfig();
    const client = createResourceClient(resourceType, config);
    if (resourceType === "model") {
        try {
            await request(`${client.prefix}/api/v1/models/${encodeURIComponent(name)}/versions`, {
                method: "POST",
                baseUrl: client.baseUrl,
                body: { branch: version, baseBranch: "main" },
            });
        } catch (error) {
            if (isExistsError(error)) {
                console.log(`skip existing ${resourceType} ${name} version ${version}`);
                return;
            }
            throw error;
        }
        return;
    }
    try {
        await request(`${client.prefix}/api/v1/datasets/${encodeURIComponent(name)}/versions`, {
            method: "POST",
            baseUrl: client.baseUrl,
            body: { newBranch: version, baseBranch: "main" },
        });
    } catch (error) {
        if (isExistsError(error)) {
            console.log(`skip existing ${resourceType} ${name} version ${version}`);
            return;
        }
        throw error;
    }
}

function resolveResourcePath(resourcesDir, resourceType, item) {
    if (String(item.path || "").trim()) {
        return absPath(resourcesDir, item.path);
    }
    return path.join(resourcesDir, resourceType === "dataset" ? "datasets" : "models", item.name);
}

async function prepareWorkspace(resourceType, name, sourcePath) {
    const stat = await fs.stat(sourcePath);
    if (stat.isDirectory()) {
        console.log(`use ${resourceType} ${name} resource directory as workspace: ${sourcePath}`);
        return { workspace: sourcePath, cleanup: async () => {}, materialize: false };
    }
    if (!stat.isFile()) {
        throw new Error(`${resourceType} ${name} resource path is neither file nor directory: ${sourcePath}`);
    }
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), `mindreon-seed-${resourceType}-${name}-`));
    return {
        workspace,
        cleanup: async () => fs.rm(workspace, { recursive: true, force: true }),
        materialize: true,
        fileName: path.basename(sourcePath),
    };
}

async function hasStagedChanges(cwd) {
    const result = tryCommand("git", ["diff", "--cached", "--quiet"], { cwd });
    return result.status !== 0;
}

async function repoAddCommitPush(cwd, message, cfg) {
    const plan = await planTrackingPaths(cwd, [], {
        thresholdMb: cfg.dvcThresholdMb,
        fileCountThreshold: cfg.dvcFileCountThreshold,
    });
    for (const filePath of plan.dvcPaths) {
        runDvc(["add", filePath], { cwd });
    }
    runCommand("git", ["add", "-A"], { cwd });
    const directoryLabel = plan.directoryDvcPaths.length === 1 ? "directory" : "directories";
    console.log(
        `Tracked ${plan.candidatePaths.length} file(s). ${plan.directoryDvcPaths.length} ${directoryLabel} exceeded the ${plan.fileCountThreshold} file threshold and ${plan.fileDvcPaths.length} file(s) exceeded ${plan.thresholdMb} MiB; ${plan.dvcPaths.length} path(s) were added via DVC.`
    );
    if (!(await hasStagedChanges(cwd))) {
        console.log("skip commit: no staged changes");
        return { status: "skipped", reason: "no staged changes" };
    }
    await ensureGitIdentity(cwd);
    runCommand("git", ["commit", "-m", message], { cwd });
    console.log("Refreshing workspace credentials...");
    console.log("Syncing Git metadata...");
    const currentBranch = tryCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
    const branch = currentBranch.status === 0 ? currentBranch.stdout.trim() : "";
    const pushBranch = syncWorkspaceBranch(cwd, branch);
    console.log("Pushing DVC data...");
    runDvc(["push"], { cwd });
    const upstream = tryCommand("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], { cwd });
    if (upstream.status === 0) {
        console.log("Pushing Git metadata...");
        runCommand("git", ["push"], { cwd });
        return { status: "success", reason: `pushed ${branch || "current branch"}` };
    }
    console.log("Pushing Git metadata and setting upstream...");
    runCommand("git", ["push", "-u", "origin", `HEAD:${pushBranch || branch || "main"}`], { cwd });
    return { status: "success", reason: `pushed ${pushBranch || branch || "main"}` };
}

async function uploadResource(cfg, resourceType, item, { dryRun }) {
    const name = String(item.name || "").trim();
    if (!name) throw new Error(`${resourceType} name is required`);
    const version = firstNonEmpty(item.version, "main");
    console.log(`seed ${resourceType} name=${name} version=${version}`);
    const sourcePath = resolveResourcePath(cfg.resourcesDir, resourceType, item);
    if (dryRun) {
        console.log(`[dry-run] create ${resourceType} ${name} and upload from ${sourcePath}`);
        return { status: "success", reason: `dry-run would upload from ${sourcePath}` };
    }
    if (!(await pathExists(sourcePath))) {
        if (!item.prepare) {
            console.log(`skip ${resourceType} ${name}: resource path does not exist and no prepare config is set: ${sourcePath}`);
            return { status: "skipped", reason: `resource path does not exist and no prepare config is set: ${sourcePath}` };
        }
        throw new Error(`${resourceType} ${name} resource path does not exist: ${sourcePath}`);
    }
    await createPresetResource(resourceType, item);
    await createResourceVersion(resourceType, name, version);
    const { workspace, cleanup, materialize, fileName } = await prepareWorkspace(resourceType, name, sourcePath);
    try {
        console.log(`Initializing ${resourceType} workspace ${name}@${version} in ${workspace}...`);
        await connectWorkspace({ cwd: workspace, bindType: resourceType, bindName: name, version });
        if (materialize) {
            await fs.copyFile(sourcePath, path.join(workspace, fileName));
        }
        return await repoAddCommitPush(workspace, `seed preset ${resourceType} ${name}`, cfg);
    } finally {
        await cleanup();
    }
}

function imageArgs(item) {
    const repo = firstNonEmpty(item.repository, item.repo, item.name);
    const tag = String(item.tag || "").trim();
    const method = firstNonEmpty(item.method, "registry_pull");
    if (!repo) throw new Error("image repository is required");
    if (!tag) throw new Error(`image tag is required for ${repo}`);
    const args = ["build", "--repo", repo, "--tag", tag, "--method", method];
    if (item.visibility) args.push("--visibility", String(item.visibility));
    if (item.remarks) args.push("--remarks", String(item.remarks));
    if (asArray(item.tagSlugs).length > 0) args.push("--tag-slugs", cleanList(item.tagSlugs).join(","));
    if (method === "registry_pull") {
        if (!item.sourceImage) throw new Error(`sourceImage is required for registry_pull image ${repo}:${tag}`);
        args.push("--source-image", String(item.sourceImage));
        if (item.sourceUsername) args.push("--source-username", String(item.sourceUsername));
        if (item.sourcePassword) args.push("--source-password", String(item.sourcePassword));
        return args;
    }
    if (method === "upload") {
        if (!item.fileUrl) throw new Error(`fileUrl is required for upload image ${repo}:${tag}`);
        args.push("--file-url", absPathOrOriginal(item.fileUrl));
        return args;
    }
    if (method === "dockerfile") {
        if (!item.dockerfileUrl) throw new Error(`dockerfileUrl is required for dockerfile image ${repo}:${tag}`);
        args.push("--dockerfile-url", absPathOrOriginal(item.dockerfileUrl));
        return args;
    }
    throw new Error(`unsupported image method ${method}`);

    function absPathOrOriginal(value) {
        const text = String(value || "").trim();
        if (/^https?:\/\//i.test(text) || path.isAbsolute(text)) return text;
        return path.join(process.env.MINDREON_SEED_RESOURCES_DIR || DEFAULT_RESOURCES_DIR, text);
    }
}

async function uploadImage(item, { dryRun }) {
    const repo = firstNonEmpty(item.repository, item.repo, item.name);
    const tag = String(item.tag || "").trim();
    console.log(`seed image repo=${repo} tag=${tag}`);
    if (dryRun) {
        console.log(`[dry-run] image ${imageArgs(item).join(" ")}`);
        return { status: "success", reason: `dry-run would create image ${repo}:${tag}` };
    }
    try {
        await runImage({ argv: ["exists", "--repo", repo, "--tag", tag] });
        console.log(`skip existing image ${repo}:${tag}`);
        return { status: "skipped", reason: "already exists" };
    } catch (error) {
        if (error.exitCode !== 2) throw error;
    }
    await runImage({ argv: imageArgs(item) });
    return { status: "success", reason: `created image ${repo}:${tag}` };
}

function namedBodyBody(item) {
    const body = item?.body && typeof item.body === "object" ? { ...item.body } : { ...item };
    if (item.name && !body.name) {
        body.name = item.name;
    }
    body.source = "preset";
    return body;
}

async function uploadNamedBody(kind, item, { dryRun }) {
    const body = namedBodyBody(item);
    const name = String(body.name || "").trim();
    if (!name) throw new Error(`${kind} name is required`);
    if (dryRun) {
        console.log(`[dry-run] create ${kind} ${name}`);
        return { status: "success", reason: `dry-run would create ${kind} ${name}` };
    }
    const runner = kind === "runtime-config" ? createConfigCenterResource : createConfigCenterResource;
    try {
        const { runRuntimeConfig, runParameterTemplate } = await import("./config-center.js");
        const command = kind === "runtime-config" ? runRuntimeConfig : runParameterTemplate;
        await command({ argv: ["exists", "--name", name, "--source", "preset"] });
        console.log(`skip existing ${kind} ${name}`);
        return { status: "skipped", reason: "already exists" };
    } catch (error) {
        if (error.exitCode !== 2) throw error;
    }
    try {
        await runner(kind, body);
    } catch (error) {
        if (isExistsError(error)) {
            console.log(`skip existing ${kind} ${name}`);
            return { status: "skipped", reason: "already exists" };
        }
        throw error;
    }
    return { status: "success", reason: `created ${kind} ${name}` };
}

function imageName(item) {
    const repo = firstNonEmpty(item.repository, item.repo, item.name);
    const tag = String(item.tag || "").trim();
    if (!repo) return "<unnamed>";
    return tag ? `${repo}:${tag}` : repo;
}

function namedBodyName(item) {
    const body = item?.body && typeof item.body === "object" ? item.body : item;
    return String(body?.name || item?.name || "").trim() || "<unnamed>";
}

function uploadJobs(cfg, dryRun) {
    return [
        ...cfg.models.map((item) => ({
            type: "model",
            name: String(item.name || "").trim() || "<unnamed>",
            handler: () => uploadResource(cfg, "model", item, { dryRun }),
        })),
        ...cfg.datasets.map((item) => ({
            type: "dataset",
            name: String(item.name || "").trim() || "<unnamed>",
            handler: () => uploadResource(cfg, "dataset", item, { dryRun }),
        })),
        ...cfg.images.map((item) => ({
            type: "image",
            name: imageName(item),
            handler: () => uploadImage(item, { dryRun }),
        })),
        ...cfg.runtimeConfigs.map((item) => ({
            type: "runtime-config",
            name: namedBodyName(item),
            handler: () => uploadNamedBody("runtime-config", item, { dryRun }),
        })),
        ...cfg.parameterTemplates.map((item) => ({
            type: "parameter-template",
            name: namedBodyName(item),
            handler: () => uploadNamedBody("parameter-template", item, { dryRun }),
        })),
    ];
}

async function executeSeedUpload(cfg, { dryRun }) {
    const jobs = uploadJobs(cfg, dryRun);
    try {
        await ensureLogin(cfg, { dryRun });
    } catch (error) {
        const reason = `login failed: ${error.message || String(error)}`;
        console.error(reason);
        return jobs.map((job) => ({
            stage: "upload",
            type: job.type,
            name: job.name,
            status: "failed",
            reason,
        }));
    }
    return runResourceJobs("upload", jobs);
}

export async function runSeedUpload({ argv, env = process.env } = {}) {
    const { cfg, dryRun } = await resolveSeedConfig(argv, env);
    applySeedEnv(cfg);
    console.log(`mindreon seed upload started resourcesDir=${cfg.resourcesDir}`);
    const results = await executeSeedUpload(cfg, { dryRun });
    printResultsTable("mindreon seed upload summary:", results);
    throwIfFailures("mindreon seed upload", results);
    console.log("mindreon seed upload completed");
}

export async function runSeedApply({ argv, env = process.env } = {}) {
    const { cfg, dryRun } = await resolveSeedConfig(argv, env);
    applySeedEnv(cfg);
    console.log(`mindreon seed apply started resourcesDir=${cfg.resourcesDir}`);
    console.log(`mindreon seed prepare started resourcesDir=${cfg.resourcesDir}`);
    const prepareResults = await executeSeedPrepare(cfg, { dryRun });
    console.log("mindreon seed prepare completed");
    console.log(`mindreon seed upload started resourcesDir=${cfg.resourcesDir}`);
    const uploadResults = await executeSeedUpload(cfg, { dryRun });
    console.log("mindreon seed upload completed");
    const results = [...prepareResults, ...uploadResults];
    printResultsTable("mindreon seed apply summary:", results);
    throwIfFailures("mindreon seed apply", results);
    console.log("mindreon seed apply completed");
}

export async function runSeed({ argv, env = process.env } = {}) {
    const args = parseArgs(argv || []);
    const subCommand = args._[0] || "apply";
    const rest = argv.slice(1);
    if (subCommand === "prepare") {
        return runSeedPrepare({ argv: rest, env });
    }
    if (subCommand === "upload") {
        return runSeedUpload({ argv: rest, env });
    }
    if (subCommand === "apply") {
        return runSeedApply({ argv: rest, env });
    }
    throw new Error(`Unknown seed command: ${subCommand}`);
}

export const __test = {
    buildPrepareCommand,
    loadSeedConfig,
    prepareTempPath,
    resolvePrepareTargetPath,
    namedBodyBody,
    formatResultsTable,
};
