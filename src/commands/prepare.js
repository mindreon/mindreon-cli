import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { parseArgs } from "../cli/args.js";
import { runCommand } from "../utils/shell.js";

const SUPPORTED_SOURCES = new Set(["modelscope", "huggingface", "hf"]);

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
}

async function loadPrepareConfig(configFile) {
    const configPath = path.resolve(configFile || "configs/config.yaml");
    const configDir = path.dirname(configPath);
    const raw = await readYaml(configPath);
    const cfg = {
        resourcesDir: firstNonEmpty(process.env.PLATFORM_SEED_RESOURCES_DIR, raw.resourcesDir, "/resources"),
        seedDirs: asArray(raw.seedDirs),
        models: asArray(raw.models),
        datasets: asArray(raw.datasets),
    };

    const seedDirsEnv = String(process.env.PLATFORM_SEED_DIRS || "").trim();
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

async function hasEntries(targetPath) {
    try {
        const entries = await fs.readdir(targetPath);
        return entries.length > 0;
    } catch {
        return false;
    }
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

async function prepareResource(resourcesDir, resourceType, item, { dryRun }) {
    const name = String(item.name || "").trim();
    if (!name) throw new Error(`${resourceType} name is required`);
    if (!item.prepare) {
        console.log(`skip prepare ${resourceType} ${name}: no prepare config`);
        return;
    }
    const targetPath = resolvePrepareTargetPath(resourcesDir, resourceType, item);
    if (await hasEntries(targetPath)) {
        console.log(`skip prepare ${resourceType} ${name}: target path already has content: ${targetPath}`);
        return;
    }
    const prepareCmd = buildPrepareCommand(resourceType, item.prepare, targetPath);
    if (dryRun) {
        console.log(`[dry-run] prepare ${resourceType} ${name}: ${prepareCmd.command} ${prepareCmd.args.join(" ")}`);
        return;
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    const tempPath = await fs.mkdtemp(path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.prepare-`));
    const command = buildPrepareCommand(resourceType, item.prepare, tempPath);
    try {
        console.log(`run prepare command: ${command.command} ${command.args.join(" ")}`);
        runCommand(command.command, command.args);
        if (!(await hasEntries(tempPath))) {
            throw new Error(`prepared resource is empty: ${tempPath}`);
        }
        await replaceEmptyTarget(tempPath, targetPath);
    } catch (error) {
        await fs.rm(tempPath, { recursive: true, force: true });
        throw error;
    }
}

export async function runPrepare({ argv }) {
    const args = parseArgs(argv);
    const cfg = await loadPrepareConfig(args.config || args.c);
    if (args["resources-dir"]) {
        cfg.resourcesDir = args["resources-dir"];
    }
    const dryRun = Boolean(args["dry-run"]);

    console.log(`mindreon prepare started resourcesDir=${cfg.resourcesDir}`);
    for (const item of cfg.models) {
        await prepareResource(cfg.resourcesDir, "model", item, { dryRun });
    }
    for (const item of cfg.datasets) {
        await prepareResource(cfg.resourcesDir, "dataset", item, { dryRun });
    }
    console.log("mindreon prepare completed");
}

export const __test = {
    buildPrepareCommand,
    loadPrepareConfig,
    resolvePrepareTargetPath,
};
