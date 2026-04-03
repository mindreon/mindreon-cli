function normalizeBaseUrl(baseUrl) {
    return String(baseUrl || "").trim().replace(/\/+$/, "");
}

function readServiceBaseUrlOverride(serviceName) {
    const key = `MINDREON_${serviceName.toUpperCase()}_URL`;
    const value = process.env[key];
    if (typeof value !== "string") {
        return "";
    }
    return normalizeBaseUrl(value);
}

function isLikelyInternalBaseUrl(baseUrl) {
    const normalized = normalizeBaseUrl(baseUrl).toLowerCase();
    return (
        normalized.includes(".svc") ||
        normalized.includes(".default") ||
        normalized.includes(".local") ||
        normalized.includes("localhost") ||
        normalized.includes("127.0.0.1") ||
        normalized.includes("file-version-manager") ||
        normalized.includes("iam-service")
    );
}

function readPrefixOverride(serviceName) {
    const key = `MINDREON_${serviceName.toUpperCase()}_PREFIX`;
    const value = process.env[key];
    if (typeof value !== "string") {
        return null;
    }

    const normalized = value.trim();
    if (!normalized) {
        return "";
    }

    return normalized.startsWith("/") ? normalized.replace(/\/+$/, "") : `/${normalized.replace(/\/+$/, "")}`;
}

function shouldUseGatewayPrefix(baseUrl) {
    const externalEnv = (process.env.MINDREON_EXTERNAL || process.env.FVC_EXTERNAL || "").toLowerCase();
    if (externalEnv === "true" || externalEnv === "1") {
        return true;
    }
    if (externalEnv === "false" || externalEnv === "0") {
        return false;
    }

    return !isLikelyInternalBaseUrl(baseUrl);
}

export function getServicePrefix(serviceName, baseUrl) {
    const override = readPrefixOverride(serviceName);
    if (override !== null) {
        return override;
    }

    if (serviceName === "files") {
        return "/files";
    }

    if (!shouldUseGatewayPrefix(baseUrl)) {
        return "";
    }

    if (serviceName === "fvm") {
        return "/fvm";
    }
    if (serviceName === "iam") {
        return "/iam";
    }
    if (serviceName === "dataset") {
        return "/dsv";
    }
    if (serviceName === "model") {
        return "/model-service";
    }
    if (serviceName === "workload") {
        return "/ai-nexus";
    }

    return "";
}

export function shouldRequestExternalEndpoints(baseUrl) {
    return shouldUseGatewayPrefix(baseUrl);
}

export function normalizeResolvedBaseUrl(baseUrl) {
    return normalizeBaseUrl(baseUrl);
}

export function resolveServiceBaseUrl(serviceName, config = {}) {
    const override = readServiceBaseUrlOverride(serviceName);
    if (override) {
        return override;
    }
    return normalizeResolvedBaseUrl(process.env.MINDREON_API_URL || config.url || "");
}
