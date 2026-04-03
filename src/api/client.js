import { loadConfig } from "../cli/config.js";
import { normalizeResolvedBaseUrl } from "../utils/routes.js";

const DEFAULT_BASE_URL = "https://dev-4-13.mindreon.com";

export function resolveBaseUrl(config = {}) {
    return normalizeResolvedBaseUrl(process.env.MINDREON_API_URL || config.url || DEFAULT_BASE_URL);
}

export async function request(endpoint, options = {}) {
    const method = options.method || "GET";
    const body = options.body ? JSON.stringify(options.body) : undefined;
    const config = await loadConfig();

    const headers = new Headers();
    headers.set("Content-Type", "application/json");

    // Load auth token if available unless explicitly disabled
    if (!options.skipAuth) {
        if (config.token) {
            headers.set("Authorization", `Bearer ${config.token}`);
        }
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
