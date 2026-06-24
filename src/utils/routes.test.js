import test from "node:test";
import assert from "node:assert/strict";

import { resolveServiceBaseUrl } from "./routes.js";

test("resolveServiceBaseUrl accepts legacy FVM_URL alias", () => {
    const originalMindreonFvm = process.env.MINDREON_FVM_URL;
    const originalFvm = process.env.FVM_URL;
    const originalApi = process.env.MINDREON_API_URL;
    try {
        delete process.env.MINDREON_FVM_URL;
        delete process.env.MINDREON_API_URL;
        process.env.FVM_URL = "http://file-version-manager.default:80";

        assert.equal(resolveServiceBaseUrl("fvm", {}), "http://file-version-manager.default:80");
    } finally {
        restoreEnv("MINDREON_FVM_URL", originalMindreonFvm);
        restoreEnv("FVM_URL", originalFvm);
        restoreEnv("MINDREON_API_URL", originalApi);
    }
});

function restoreEnv(key, value) {
    if (value === undefined) {
        delete process.env[key];
    } else {
        process.env[key] = value;
    }
}
