import { URL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { loadConfig, saveConfig } from "../cli/config.js";
import { request, resolveBaseUrl } from "../api/client.js";
import { getServicePrefix, shouldRequestExternalEndpoints } from "./routes.js";

const READY_REPO_STATUSES = new Set(["", "ready"]);
const FAILED_REPO_STATUSES = new Set(["failed"]);
const DEFAULT_REPO_READY_TIMEOUT_MS = 60000;
const DEFAULT_REPO_READY_INTERVAL_MS = 2000;

export async function getMindreonContext() {
    const config = await loadConfig();
    const baseUrl = resolveBaseUrl(config);
    const token = config.token || "";
    return {
        config,
        baseUrl,
        token,
        fvmPrefix: getServicePrefix("fvm", baseUrl),
        externalEndpoints: shouldRequestExternalEndpoints(baseUrl),
    };
}

export async function ensureLoggedIn() {
    const context = await getMindreonContext();
    if (!context.token) {
        throw new Error("Not logged in. Please run 'mindreon login' first.");
    }
    return context;
}

export async function getGitAccessToken({ forceRefresh = false } = {}) {
    const context = await ensureLoggedIn();
    if (!forceRefresh && context.config.gitAccessToken) {
        return context.config.gitAccessToken;
    }

    const response = await request(`${context.fvmPrefix}/api/auth/git-token`);
    const gitAccessToken =
        response?.data?.token ||
        response?.data?.accessToken ||
        response?.data?.gitToken ||
        "";

    if (!gitAccessToken) {
        throw new Error("Failed to exchange Git access token from FVM.");
    }

    await saveConfig({ gitAccessToken });
    return gitAccessToken;
}

export async function lookupFvs(bindType, name) {
    const context = await ensureLoggedIn();
    const params = new URLSearchParams({ bindType, name });
    const response = await request(`${context.fvmPrefix}/api/v1/fvs/lookup?${params.toString()}`);
    return response.data || response;
}

export async function getFileVersion(fvsId) {
    const context = await ensureLoggedIn();
    const response = await request(`${context.fvmPrefix}/api/v1/fvs/${encodeURIComponent(fvsId)}`);
    return response.data || response;
}

export async function getFvsCredentials(fvsId) {
    const context = await ensureLoggedIn();
    const params = new URLSearchParams();
    if (context.externalEndpoints) {
        params.set("external", "true");
    }
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const response = await request(
        `${context.fvmPrefix}/api/v1/fvs/${encodeURIComponent(fvsId)}/credentials${suffix}`
    );
    return response.data || response;
}

export async function buildGitUrl(fvsInfo, fallbackName, options = {}) {
    const { baseUrl, fvmPrefix } = await ensureLoggedIn();
    const gitAccessToken = await getGitAccessToken(options);
    const repoId = fvsInfo?.id || fvsInfo?.fvsId || fvsInfo?.repoId || fallbackName;
    if (!repoId) {
        throw new Error("Unable to resolve Git repository identifier from FVS.");
    }

    const url = new URL(baseUrl);
    const basePath = url.pathname.replace(/\/$/, "");
    const proxyPrefix = fvmPrefix ? `${fvmPrefix}` : "";
    const encodedToken = encodeURIComponent(gitAccessToken);
    return `${url.protocol}//oauth2:${encodedToken}@${url.host}${basePath}${proxyPrefix}/${repoId}.git`;
}

function normalizeRepoStatus(value) {
    return String(value || "").trim().toLowerCase();
}

function formatRepoStatus(status, statusMessage) {
    const normalizedStatus = normalizeRepoStatus(status) || "unknown";
    const normalizedMessage = String(statusMessage || "").trim();
    return normalizedMessage ? `${normalizedStatus}: ${normalizedMessage}` : normalizedStatus;
}

export async function waitForRepoReady(fvsId, options = {}) {
    const timeoutMs = Number(options.timeoutMs || process.env.MINDREON_REPO_READY_TIMEOUT_MS || DEFAULT_REPO_READY_TIMEOUT_MS);
    const intervalMs = Number(options.intervalMs || process.env.MINDREON_REPO_READY_INTERVAL_MS || DEFAULT_REPO_READY_INTERVAL_MS);
    const label = String(options.label || fvsId).trim() || fvsId;
    const deadline = Date.now() + timeoutMs;

    let lastStatus = "";
    let lastStatusMessage = "";

    while (true) {
        const fvs = await getFileVersion(fvsId);
        const repoStatus = normalizeRepoStatus(fvs.repoStatus);
        const repoStatusMessage = String(fvs.repoStatusMessage || "").trim();
        lastStatus = repoStatus;
        lastStatusMessage = repoStatusMessage;

        if (READY_REPO_STATUSES.has(repoStatus)) {
            return fvs;
        }

        if (FAILED_REPO_STATUSES.has(repoStatus)) {
            throw new Error(
                `FVS repository is not ready for ${label}. Status: ${formatRepoStatus(repoStatus, repoStatusMessage)}`
            );
        }

        if (Date.now() >= deadline) {
            throw new Error(
                `Timed out waiting for FVS repository to become ready for ${label}. Last status: ${formatRepoStatus(lastStatus, lastStatusMessage)}`
            );
        }

        await sleep(intervalMs);
    }
}
