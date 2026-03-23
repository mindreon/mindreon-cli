import { URL } from "node:url";
import { loadConfig, saveConfig } from "../cli/config.js";
import { request, resolveBaseUrl } from "../api/client.js";
import { getServicePrefix, shouldRequestExternalEndpoints } from "./routes.js";

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
        throw new Error("Not logged in. Please run 'mindreon-mcp login' first.");
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
