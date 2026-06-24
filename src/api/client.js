import { loadConfig } from "../cli/config.js";
import { normalizeResolvedBaseUrl } from "../utils/routes.js";

const DEFAULT_BASE_URL = "https://dev-4-13.mindreon.com";
const SIGNED_HEADER_ENV_MAP = {
    FVC_HEADER_X_USER_ID: "X-User-ID",
    FVC_HEADER_X_USER_NAME: "X-User-Name",
    FVC_HEADER_X_PROJECT_ID: "X-Project-ID",
    FVC_HEADER_X_PROJECT_NAME: "X-Project-Name",
    FVC_HEADER_X_TENANT_ID: "X-Tenant-ID",
    FVC_HEADER_X_TENANT_NAME: "X-Tenant-Name",
    FVC_HEADER_X_USER_SIGNATURE: "X-User-Signature",
    FVC_HEADER_X_USER_TIMESTAMP: "X-User-Timestamp",
    FVC_HEADER_X_USER_NONCE: "X-User-Nonce",
    FVC_HEADER_X_AUTH_SIGNATURE: "X-Auth-Signature",
    FVC_HEADER_X_AUTH_TIMESTAMP: "X-Auth-Timestamp",
    FVC_HEADER_X_AUTH_NONCE: "X-Auth-Nonce",
};

function firstNonEmpty(...values) {
    for (const value of values) {
        const normalized = String(value || "").trim();
        if (normalized) return normalized;
    }
    return "";
}

export function resolveBaseUrl(config = {}) {
    return normalizeResolvedBaseUrl(process.env.MINDREON_API_URL || config.url || DEFAULT_BASE_URL);
}

export function resolveAuthToken(config = {}) {
    return firstNonEmpty(process.env.MINDREON_AUTH_TOKEN, process.env.FVC_TOKEN, process.env.FVM_TOKEN, config.token);
}

export function applySignedHeaderEnvs(headers, env = process.env) {
    for (const [envKey, headerKey] of Object.entries(SIGNED_HEADER_ENV_MAP)) {
        const value = String(env[envKey] || "").trim();
        if (value) {
            headers.set(headerKey, value);
        }
    }
}

export function hasSignedHeaderAuth(env = process.env) {
    return Boolean(
        String(env.FVC_HEADER_X_USER_ID || "").trim() &&
            String(env.FVC_HEADER_X_USER_SIGNATURE || "").trim() &&
            String(env.FVC_HEADER_X_USER_TIMESTAMP || "").trim() &&
            String(env.FVC_HEADER_X_USER_NONCE || "").trim()
    );
}

export function hasAuthContext(config = {}, env = process.env) {
    return Boolean(resolveAuthToken(config) || hasSignedHeaderAuth(env));
}

export async function request(endpoint, options = {}) {
    const method = options.method || "GET";
    const body = options.body ? JSON.stringify(options.body) : undefined;
    const config = await loadConfig();

    const headers = new Headers();
    headers.set("Content-Type", "application/json");

    // Load auth token if available unless explicitly disabled
    if (!options.skipAuth) {
        const token = resolveAuthToken(config);
        if (token) {
            headers.set("Authorization", `Bearer ${token}`);
        }
        applySignedHeaderEnvs(headers);
    }

    if (options.headers) {
        for (const [key, value] of Object.entries(options.headers)) {
            headers.set(key, value);
        }
    }

    const baseUrl = normalizeResolvedBaseUrl(options.baseUrl || resolveBaseUrl(config));
    const url = `${baseUrl}${endpoint}`;

    const fetchOptions = {
        method,
        headers,
        body,
    };

    const response = await fetch(url, fetchOptions);

    let data;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        data = await response.json();
    } else {
        data = await response.text();
    }

    if (!response.ok) {
        let msg = `Request failed: ${response.status} ${response.statusText}`;
        if (data && data.msg) {
            msg += ` - ${data.msg}`;
        } else if (typeof data === "string") {
            msg += ` - ${data}`;
        }
        const error = new Error(msg);
        error.status = response.status;
        error.data = data;
        throw error;
    }

    // All mindreon APIs usually return { code: 0, msg: "success", data: {} }
    if (data && typeof data === "object" && "code" in data && "data" in data) {
        if (data.code !== 0) {
            const error = new Error(data.msg || "Unknown API Error");
            error.code = data.code;
            throw error;
        }
        return data;
    }

    return data;
}
