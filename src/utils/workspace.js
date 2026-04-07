import fs from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";
import { readIni, writeIni } from "./ini.js";
import { buildGitUrl, getFvsCredentials, lookupFvs, waitForRepoReady } from "./fvm.js";
import { captureCommand, runCommand, tryCommand } from "./shell.js";
import { loadConfig } from "../cli/config.js";

const INTERNAL_DIRS = new Set([".git", ".dvc"]);
const ALWAYS_GIT_TRACK_FILES = new Set([".dvcignore", ".gitignore", ".gitattributes", ".gitmodules"]);
const DEFAULT_THRESHOLD_MB = 5;
const DEFAULT_FILE_COUNT_THRESHOLD = 2000;
const DEFAULT_DVC_CACHE_TYPE = "copy";
const ROOT_DVC_GITIGNORE_VARIANTS = new Set([".dvc", ".dvc/", "/.dvc", "/.dvc/"]);

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

function rootGitignoreHasDvcDir(content) {
    for (const line of String(content || "").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
            continue;
        }
        if (ROOT_DVC_GITIGNORE_VARIANTS.has(trimmed)) {
            return true;
        }
    }
    return false;
}

function isInternalPath(relativePath) {
    const [firstSegment] = String(relativePath || "").split(path.sep);
    return INTERNAL_DIRS.has(firstSegment);
}

function shouldAlwaysGitTrack(relativePath) {
    const baseName = path.basename(relativePath);
    return ALWAYS_GIT_TRACK_FILES.has(baseName) || baseName.endsWith(".dvc");
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

export function parseFileCountThreshold(value) {
    const raw = String(value || "").trim();
    if (!raw) {
        return DEFAULT_FILE_COUNT_THRESHOLD;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
        throw new Error("File count threshold must be a non-negative integer.");
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

export async function ensureRootGitignoreHasDvcDir(cwd) {
    const gitignorePath = path.join(cwd, ".gitignore");
    const existing = (await pathExists(gitignorePath))
        ? await fs.readFile(gitignorePath, "utf-8")
        : "";

    if (rootGitignoreHasDvcDir(existing)) {
        return;
    }

    const prefix = existing.trimEnd();
    const next = prefix
        ? `${prefix}\n\n# DVC metadata\n.dvc/\n`
        : "# DVC metadata\n.dvc/\n";
    await fs.writeFile(gitignorePath, next, "utf-8");
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
    await ensureRootGitignoreHasDvcDir(cwd);

    const configPath = path.join(cwd, ".dvc", "config");
    const existing = await readIni(configPath);
    const remoteSection = 'remote "storage"';
    const cacheDir = String(process.env.MINDREON_DVC_CACHE_DIR || process.env.DVC_CACHE_DIR || "").trim();
    const cacheType = String(process.env.MINDREON_DVC_CACHE_TYPE || process.env.DVC_CACHE_TYPE || "").trim();

    const cacheConfig = {
        ...(existing.cache || {}),
        type: cacheType || (existing.cache || {}).type || DEFAULT_DVC_CACHE_TYPE,
    };
    if (cacheDir) {
        cacheConfig.dir = cacheDir;
    }

    const nextConfig = {
        ...existing,
        core: {
            ...(existing.core || {}),
            remote: "storage",
            autostage: "true",
        },
        cache: cacheConfig,
        [remoteSection]: buildRemoteStorageConfig(creds, fvsId),
    };

    await writeIni(configPath, nextConfig);
}

function buildRemoteStorageConfig(creds, fvsId) {
    const bucket = String(creds.bucket || "").trim();
    const prefix = String(creds.prefix || fvsId || "").trim();

    if (!bucket || !prefix) {
        return {};
    }

    return {
        url: `s3://${bucket}/${prefix}`,
    };
}

function buildRemoteCredentialSection(creds) {
    return {
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
        'remote "storage"': buildRemoteCredentialSection(creds),
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

    await waitForRepoReady(fvsId, {
        label: `${bindType} '${bindName}'`,
    });

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

async function isConnectedWorkspace(cwd) {
    const gitDir = path.join(cwd, ".git");
    const dvcDir = path.join(cwd, ".dvc");
    const workspaceConfigPath = path.join(dvcDir, "fvc_config");

    if (!(await pathExists(gitDir)) || !(await pathExists(dvcDir)) || !(await pathExists(workspaceConfigPath))) {
        return false;
    }

    const workspaceConfig = await readWorkspaceConfig(cwd);
    return Boolean(workspaceConfig.fvc?.fvs_id);
}

export async function ensureDownloadTargetAvailable(cwd) {
    if (!(await pathExists(cwd))) {
        return;
    }

    const stat = await fs.stat(cwd);
    if (!stat.isDirectory()) {
        throw new Error(`Target path already exists and is not a directory: ${cwd}`);
    }

    const entries = await fs.readdir(cwd);
    if (entries.length === 0) {
        return;
    }

    if (await isConnectedWorkspace(cwd)) {
        return;
    }

    throw new Error(`Target directory already exists and is not empty: ${cwd}. Please remove it or choose another path.`);
}

export async function pullWorkspace(cwd) {
    await refreshWorkspaceGitRemote(cwd);
    const workspaceConfig = await readWorkspaceConfig(cwd);
    const preferredBranch = getCurrentBranch(cwd) || workspaceConfig.fvc?.version || "";
    const branch = syncWorkspaceBranch(cwd, preferredBranch);
    await refreshWorkspaceCredentials(cwd);
    runCommand("dvc", ["pull"], { cwd });
    return { branch };
}

export async function downloadWorkspace({ cwd, bindType, bindName, version }) {
    await ensureDownloadTargetAvailable(cwd);
    const connected = await connectWorkspace({
        cwd,
        bindType,
        bindName,
        version,
    });
    const pulled = await pullWorkspace(cwd);
    return {
        ...connected,
        branch: pulled.branch || connected.branch,
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
    const code = line.slice(0, 2);
    const payload = line.slice(3).trim();
    if (!payload) {
        return null;
    }
    if (payload.includes(" -> ")) {
        return {
            code,
            path: payload.split(" -> ").pop().trim(),
        };
    }
    return {
        code,
        path: payload,
    };
}

async function getChangedEntries(cwd) {
    const result = captureCommand("git", ["status", "--porcelain"], { cwd });
    const lines = result ? result.split(/\r?\n/) : [];
    const entries = [];
    for (const line of lines) {
        const parsed = parseGitStatusLine(line);
        if (parsed) {
            entries.push({
                code: parsed.code,
                path: path.relative(cwd, path.resolve(cwd, parsed.path)),
            });
        }
    }
    return entries;
}

async function getChangedPaths(cwd) {
    const entries = await getChangedEntries(cwd);
    return entries.map((entry) => entry.path);
}

async function normalizeCandidateInputs(cwd, explicitPaths) {
    const candidates = explicitPaths.length > 0 ? explicitPaths : await getChangedPaths(cwd);
    const normalized = new Set();

    for (const candidate of candidates) {
        const value = String(candidate || "").trim();
        if (!value) {
            continue;
        }

        const absolutePath = path.resolve(cwd, value);
        if (!(await pathExists(absolutePath))) {
            continue;
        }
        const relativePath = path.relative(cwd, absolutePath);
        if (isInternalPath(relativePath)) {
            continue;
        }

        normalized.add(relativePath);
    }

    return Array.from(normalized).sort();
}

export async function collectTrackedCandidates(cwd, explicitPaths) {
    const candidates = await normalizeCandidateInputs(cwd, explicitPaths);
    const expanded = new Set();

    for (const candidate of candidates) {
        for (const filePath of await expandCandidatePath(cwd, candidate)) {
            expanded.add(filePath);
        }
    }

    return Array.from(expanded).sort();
}

function pathDepth(relativePath) {
    return relativePath.split(path.sep).filter(Boolean).length;
}

function isSameOrChildPath(parentPath, candidatePath) {
    return candidatePath === parentPath || candidatePath.startsWith(`${parentPath}${path.sep}`);
}

async function collectDirectoryCandidates(cwd, candidateInputs, explicitPaths) {
    const explicitMode = explicitPaths.length > 0;
    const changedEntryMap = explicitMode
        ? new Map()
        : new Map((await getChangedEntries(cwd)).map((entry) => [entry.path, entry.code]));
    const directories = [];

    for (const candidate of candidateInputs) {
        const absolutePath = path.resolve(cwd, candidate);
        const stat = await fs.stat(absolutePath);
        if (!stat.isDirectory()) {
            continue;
        }

        if (!explicitMode && changedEntryMap.get(candidate) !== "??") {
            continue;
        }

        directories.push(candidate);
    }

    directories.sort((left, right) => {
        const depthDiff = pathDepth(left) - pathDepth(right);
        return depthDiff !== 0 ? depthDiff : left.localeCompare(right);
    });

    const selected = [];
    for (const directory of directories) {
        if (selected.some((existing) => isSameOrChildPath(existing, directory))) {
            continue;
        }
        selected.push(directory);
    }

    return selected;
}

export async function planTrackingPaths(cwd, explicitPaths, options = {}) {
    const candidateInputs = await normalizeCandidateInputs(cwd, explicitPaths);
    const candidatePaths = await collectTrackedCandidates(cwd, explicitPaths);
    const fileCountThreshold = parseFileCountThreshold(options.fileCountThreshold);
    const directoryDvcPaths =
        candidatePaths.length > fileCountThreshold
            ? await collectDirectoryCandidates(cwd, candidateInputs, explicitPaths)
            : [];

    const coveredPaths = new Set();
    for (const directoryPath of directoryDvcPaths) {
        for (const filePath of await expandCandidatePath(cwd, directoryPath)) {
            coveredPaths.add(filePath);
        }
    }

    const remainingPaths = candidatePaths.filter((filePath) => !coveredPaths.has(filePath));
    const {
        dvcPaths: fileDvcPaths,
        gitPaths,
        thresholdMb,
    } = await splitTrackingPaths(cwd, remainingPaths, options.thresholdMb);

    return {
        candidatePaths,
        directoryDvcPaths,
        fileDvcPaths,
        dvcPaths: [...directoryDvcPaths, ...fileDvcPaths],
        gitPaths,
        thresholdMb,
        fileCountThreshold,
    };
}

export async function splitTrackingPaths(cwd, pathsToCheck, thresholdMb) {
    const thresholdBytes = parseThresholdMb(thresholdMb) * 1024 * 1024;
    const dvcPaths = [];
    const gitPaths = [];

    for (const relativePath of pathsToCheck) {
        if (shouldAlwaysGitTrack(relativePath)) {
            gitPaths.push(relativePath);
            continue;
        }
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
