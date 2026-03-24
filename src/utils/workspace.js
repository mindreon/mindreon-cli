import fs from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";
import { readIni, writeIni } from "./ini.js";
import { buildGitUrl, getFvsCredentials, lookupFvs } from "./fvm.js";
import { captureCommand, runCommand, tryCommand } from "./shell.js";
import { loadConfig } from "../cli/config.js";

const INTERNAL_DIRS = new Set([".git", ".dvc"]);
const DEFAULT_THRESHOLD_MB = 5;

function normalizeBranch(value) {
    return (value || "").trim();
}

function defaultGitUserEmail(userName) {
    const normalized = userName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^[._-]+|[._-]+$/g, "") || "admin";
    return `${normalized}@mindreon.com`;
}

async function pathExists(targetPath) {
    try {
        await fs.access(targetPath);
        return true;
    } catch {
        return false;
    }
}

function normalizeDvcEndpointUrl(rawUrl) {
    const endpointUrl = String(rawUrl || "").trim();
    if (!endpointUrl) {
        return "";
    }

    try {
        const parsed = new URL(endpointUrl);
        const normalizedPath = parsed.pathname.replace(/\/+$/, "");
        if (normalizedPath === "/jfs-s3") {
            parsed.pathname = "/jfs-s3-v1";
            return parsed.toString().replace(/\/$/, "");
        }
    } catch {
        return endpointUrl;
    }

    return endpointUrl;
}

export function parseThresholdMb(value) {
    const raw = String(value || "").trim();
    if (!raw) {
        return DEFAULT_THRESHOLD_MB;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error("Threshold must be a non-negative number.");
    }

    return parsed;
}

export async function ensureGitIdentity(cwd) {
    const existingName = tryCommand("git", ["config", "--get", "user.name"], { cwd });
    const existingEmail = tryCommand("git", ["config", "--get", "user.email"], { cwd });
    if (
        existingName.status === 0 &&
        (existingName.stdout || "").trim() &&
        existingEmail.status === 0 &&
        (existingEmail.stdout || "").trim()
    ) {
        return;
    }

    const cliConfig = await loadConfig();
    const userName =
        process.env.FVC_GIT_USER_NAME ||
        process.env.GIT_AUTHOR_NAME ||
        cliConfig.username ||
        "admin";
    const userEmail =
        process.env.FVC_GIT_USER_EMAIL ||
        process.env.GIT_AUTHOR_EMAIL ||
        defaultGitUserEmail(userName);

    if (existingName.status !== 0 || !(existingName.stdout || "").trim()) {
        runCommand("git", ["config", "user.name", userName], { cwd });
    }
    if (existingEmail.status !== 0 || !(existingEmail.stdout || "").trim()) {
        runCommand("git", ["config", "user.email", userEmail], { cwd });
    }
}

export async function ensureDvcGitignore(cwd) {
    const gitignorePath = path.join(cwd, ".dvc", ".gitignore");
    const marker = "/fvc_config";
    const existing = (await pathExists(gitignorePath))
        ? await fs.readFile(gitignorePath, "utf-8")
        : "";

    if (!existing.includes(marker)) {
        const prefix = existing.trimEnd();
        const next = prefix
            ? `${prefix}\n\n# Mindreon workspace metadata\n${marker}\n`
            : `# Mindreon workspace metadata\n${marker}\n`;
        await fs.writeFile(gitignorePath, next, "utf-8");
    }
}

export async function readWorkspaceConfig(cwd) {
    const filePath = path.join(cwd, ".dvc", "fvc_config");
    return readIni(filePath);
}

export async function writeWorkspaceConfig(cwd, nextConfig) {
    const filePath = path.join(cwd, ".dvc", "fvc_config");
    await writeIni(filePath, nextConfig);
}

export async function ensureDvcConfig(cwd, creds, fvsId) {
    const configPath = path.join(cwd, ".dvc", "config");
    const existing = await readIni(configPath);
    const remoteSection = 'remote "storage"';
    const bucket = creds.bucket || "";
    const prefix = creds.prefix || fvsId;
    const remoteConfig = {};

    if (bucket) {
        remoteConfig.url = `s3://${bucket}/${prefix}`;
    }

    const nextConfig = {
        ...existing,
        core: {
            ...(existing.core || {}),
            remote: (existing.core || {}).remote || "storage",
            autostage: (existing.core || {}).autostage || "true",
        },
        cache: {
            ...(existing.cache || {}),
            type: "copy",
        },
        [remoteSection]: remoteConfig,
    };

    await writeIni(configPath, nextConfig);
}

function buildRemoteCredentialSection(existingSection, creds) {
    return {
        ...(existingSection || {}),
        endpointurl: normalizeDvcEndpointUrl(creds.endpointUrl || creds.endpoint_url || ""),
        access_key_id: creds.accessKeyId || creds.access_key_id || "",
        secret_access_key: creds.secretAccessKey || creds.secret_access_key || "",
        session_token: creds.sessionToken || creds.session_token || "",
        region: creds.region || "",
    };
}

async function writeDvcLocalConfig(cwd, creds) {
    const configPath = path.join(cwd, ".dvc", "config.local");
    const existing = await readIni(configPath);
    const nextConfig = {
        ...existing,
        'remote "storage"': buildRemoteCredentialSection(existing['remote "storage"'], creds),
    };
    await writeIni(configPath, nextConfig);
}

export async function saveWorkspaceCredentials(cwd, { fvsId, bindType, bindName, version, creds }) {
    const existingFvcConfig = await readWorkspaceConfig(cwd);
    const nextFvcConfig = {
        fvc: {
            ...(existingFvcConfig.fvc || {}),
            fvs_id: fvsId,
            bind_type: bindType,
            bind_name: bindName,
            version: version || (existingFvcConfig.fvc || {}).version || "",
        },
    };

    await writeWorkspaceConfig(cwd, nextFvcConfig);
    await writeDvcLocalConfig(cwd, creds);
    await ensureDvcGitignore(cwd);
}

export async function refreshWorkspaceCredentials(cwd) {
    const workspaceConfig = await readWorkspaceConfig(cwd);
    const fvsId = workspaceConfig.fvc?.fvs_id;
    if (!fvsId) {
        throw new Error("Current directory is not connected. Missing .dvc/fvc_config fvs_id.");
    }

    const creds = await getFvsCredentials(fvsId);
    await ensureDvcConfig(cwd, creds, fvsId);
    await saveWorkspaceCredentials(cwd, {
        fvsId,
        bindType: workspaceConfig.fvc?.bind_type || "",
        bindName: workspaceConfig.fvc?.bind_name || "",
        version: workspaceConfig.fvc?.version || "",
        creds,
    });
    return {
        fvsId,
        creds,
        workspaceConfig: await readWorkspaceConfig(cwd),
    };
}

function detectDefaultBranch(cwd) {
    const result = tryCommand("git", ["remote", "show", "origin"], { cwd });
    if (result.status !== 0) {
        return "main";
    }

    for (const line of (result.stdout || "").split(/\r?\n/)) {
        if (line.includes("HEAD branch")) {
            return line.split(":").pop().trim();
        }
    }

    return "main";
}

function hasLocalCommits(cwd) {
    return tryCommand("git", ["rev-parse", "--verify", "HEAD"], { cwd }).status === 0;
}

function remoteBranchExists(cwd, branch) {
    return tryCommand("git", ["show-ref", "--verify", "--quiet", `refs/remotes/origin/${branch}`], { cwd }).status === 0;
}

function ensureGitRepository(cwd) {
    const localGitDir = path.join(cwd, ".git");
    if (tryCommand("git", ["rev-parse", "--git-dir"], { cwd }).status === 0 && tryCommand("test", ["-d", localGitDir], { cwd }).status === 0) {
        return;
    }
    runCommand("git", ["init"], { cwd });
}

function ensureLocalBranch(cwd, branch) {
    const targetBranch = normalizeBranch(branch) || "main";
    const currentBranch = (captureCommand("git", ["branch", "--show-current"], { cwd }) || "").trim();
    if (currentBranch === targetBranch) {
        return targetBranch;
    }
    runCommand("git", ["checkout", "-B", targetBranch], { cwd });
    return targetBranch;
}

function setOriginRemote(cwd, gitUrl) {
    const existing = tryCommand("git", ["remote", "get-url", "origin"], { cwd });
    if (existing.status === 0) {
        runCommand("git", ["remote", "set-url", "origin", gitUrl], { cwd });
        return;
    }
    runCommand("git", ["remote", "add", "origin", gitUrl], { cwd });
}

export async function refreshWorkspaceGitRemote(cwd) {
    const workspaceConfig = await readWorkspaceConfig(cwd);
    const fvsId = workspaceConfig.fvc?.fvs_id;
    if (!fvsId) {
        throw new Error("Current directory is not connected. Missing .dvc/fvc_config fvs_id.");
    }

    const gitUrl = await buildGitUrl(
        { id: fvsId },
        workspaceConfig.fvc?.bind_name || "",
        { forceRefresh: true }
    );
    setOriginRemote(cwd, gitUrl);
    return gitUrl;
}

function syncRemoteBranch(cwd, branch) {
    const targetBranch = normalizeBranch(branch) || detectDefaultBranch(cwd);
    const fetchResult = tryCommand("git", ["fetch", "origin"], { cwd });
    if (fetchResult.status !== 0 || !remoteBranchExists(cwd, targetBranch)) {
        ensureLocalBranch(cwd, targetBranch);
        return targetBranch;
    }

    if (!hasLocalCommits(cwd)) {
        runCommand("git", ["checkout", "-f", "-B", targetBranch, `origin/${targetBranch}`], { cwd });
        tryCommand("git", ["branch", "--set-upstream-to", `origin/${targetBranch}`, targetBranch], { cwd });
        return targetBranch;
    }

    const checkoutResult = tryCommand("git", ["checkout", targetBranch], { cwd });
    if (checkoutResult.status !== 0) {
        runCommand("git", ["checkout", "-b", targetBranch], { cwd });
    }
    const mergeResult = tryCommand(
        "git",
        [
            "merge",
            `origin/${targetBranch}`,
            "--allow-unrelated-histories",
            "-m",
            `Merge remote branch '${targetBranch}' via mindreon connect`,
        ],
        { cwd }
    );
    if (mergeResult.status !== 0) {
        throw new Error(
            `Failed to merge remote branch '${targetBranch}'. Resolve conflicts manually before continuing.`
        );
    }
    tryCommand("git", ["branch", "--set-upstream-to", `origin/${targetBranch}`, targetBranch], { cwd });

    return targetBranch;
}

export function syncWorkspaceBranch(cwd, branch = "") {
    return syncRemoteBranch(cwd, branch);
}

export async function connectWorkspace({ cwd, bindType, bindName, version }) {
    await fs.mkdir(cwd, { recursive: true });
    const safeDir = tryCommand("git", ["config", "--global", "--add", "safe.directory", cwd], { cwd });
    if (safeDir.error) {
        throw safeDir.error;
    }

    const fvsInfo = await lookupFvs(bindType, bindName);
    const fvsId = fvsInfo.id || fvsInfo.fvsId;
    if (!fvsId) {
        throw new Error(`Unable to resolve FVS for ${bindType} '${bindName}'.`);
    }

    const creds = await getFvsCredentials(fvsId);
    const gitUrl = await buildGitUrl(fvsInfo, bindName, { forceRefresh: true });

    ensureGitRepository(cwd);
    setOriginRemote(cwd, gitUrl);
    const resolvedBranch = ensureLocalBranch(
        cwd,
        normalizeBranch(version) || fvsInfo.defaultBranch || "main"
    );

    const dvcDir = path.join(cwd, ".dvc");
    if (!(await pathExists(dvcDir))) {
        runCommand("dvc", ["init"], { cwd });
    }

    await ensureDvcConfig(cwd, creds, fvsId);
    await saveWorkspaceCredentials(cwd, {
        fvsId,
        bindType,
        bindName,
        version: resolvedBranch || normalizeBranch(version),
        creds,
    });

    return {
        fvsId,
        branch: resolvedBranch || normalizeBranch(version) || fvsInfo.defaultBranch || "main",
    };
}

async function walkFiles(baseDir, relativePath = "") {
    const targetDir = path.join(baseDir, relativePath);
    const entries = await fs.readdir(targetDir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        if (INTERNAL_DIRS.has(entry.name)) {
            continue;
        }
        const nextRelative = relativePath ? path.join(relativePath, entry.name) : entry.name;
        if (entry.isDirectory()) {
            files.push(...(await walkFiles(baseDir, nextRelative)));
            continue;
        }
        if (entry.isFile()) {
            files.push(nextRelative);
        }
    }

    return files;
}

async function expandCandidatePath(cwd, candidatePath) {
    const absolutePath = path.resolve(cwd, candidatePath);
    const stat = await fs.stat(absolutePath);
    if (stat.isDirectory()) {
        return walkFiles(cwd, path.relative(cwd, absolutePath));
    }
    if (stat.isFile()) {
        return [path.relative(cwd, absolutePath)];
    }
    return [];
}

function parseGitStatusLine(line) {
    if (!line.trim()) {
        return null;
    }
    const payload = line.slice(3).trim();
    if (!payload) {
        return null;
    }
    if (payload.includes(" -> ")) {
        return payload.split(" -> ").pop().trim();
    }
    return payload;
}

async function getChangedPaths(cwd) {
    const result = captureCommand("git", ["status", "--porcelain"], { cwd });
    const lines = result ? result.split(/\r?\n/) : [];
    const paths = [];
    for (const line of lines) {
        const parsed = parseGitStatusLine(line);
        if (parsed) {
            paths.push(parsed);
        }
    }
    return paths;
}

export async function collectTrackedCandidates(cwd, explicitPaths) {
    const candidates = explicitPaths.length > 0 ? explicitPaths : await getChangedPaths(cwd);
    const expanded = new Set();

    for (const candidate of candidates) {
        const normalized = candidate.trim();
        if (!normalized) {
            continue;
        }

        const absolutePath = path.resolve(cwd, normalized);
        if (!(await pathExists(absolutePath))) {
            continue;
        }

        for (const filePath of await expandCandidatePath(cwd, normalized)) {
            expanded.add(filePath);
        }
    }

    return Array.from(expanded).sort();
}

export async function splitTrackingPaths(cwd, pathsToCheck, thresholdMb) {
    const thresholdBytes = parseThresholdMb(thresholdMb) * 1024 * 1024;
    const dvcPaths = [];
    const gitPaths = [];

    for (const relativePath of pathsToCheck) {
        const stat = await fs.stat(path.join(cwd, relativePath));
        if (!stat.isFile()) {
            continue;
        }
        if (stat.size >= thresholdBytes) {
            dvcPaths.push(relativePath);
        } else {
            gitPaths.push(relativePath);
        }
    }

    return { dvcPaths, gitPaths, thresholdMb: thresholdBytes / (1024 * 1024) };
}

export function getCurrentBranch(cwd) {
    const branch = tryCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
    if (branch.status !== 0) {
        return "";
    }
    const value = (branch.stdout || "").trim();
    return value === "HEAD" ? "" : value;
}
