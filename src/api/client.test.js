import test from "node:test";
import assert from "node:assert/strict";

import { applySignedHeaderEnvs, hasAuthContext, hasSignedHeaderAuth, resolveAuthToken } from "./client.js";

test("resolveAuthToken reads Mindreon then FVC token aliases", () => {
    assert.equal(resolveAuthToken({ token: "config-token" }), "config-token");

    const originalMindreon = process.env.MINDREON_AUTH_TOKEN;
    const originalFvc = process.env.FVC_TOKEN;
    const originalFvm = process.env.FVM_TOKEN;
    try {
        delete process.env.MINDREON_AUTH_TOKEN;
        process.env.FVC_TOKEN = "fvc-token";
        process.env.FVM_TOKEN = "fvm-token";
        assert.equal(resolveAuthToken({ token: "config-token" }), "fvc-token");

        process.env.MINDREON_AUTH_TOKEN = "mindreon-token";
        assert.equal(resolveAuthToken({ token: "config-token" }), "mindreon-token");
    } finally {
        restoreEnv("MINDREON_AUTH_TOKEN", originalMindreon);
        restoreEnv("FVC_TOKEN", originalFvc);
        restoreEnv("FVM_TOKEN", originalFvm);
    }
});

test("applySignedHeaderEnvs maps FVC header envs to HTTP headers", () => {
    const headers = new Headers();
    applySignedHeaderEnvs(headers, {
        FVC_HEADER_X_USER_ID: "user-1",
        FVC_HEADER_X_PROJECT_NAME: "project-a",
        FVC_HEADER_X_USER_SIGNATURE: "sig-1",
        FVC_HEADER_X_AUTH_TIMESTAMP: "1700000000",
    });

    assert.equal(headers.get("X-User-ID"), "user-1");
    assert.equal(headers.get("X-Project-Name"), "project-a");
    assert.equal(headers.get("X-User-Signature"), "sig-1");
    assert.equal(headers.get("X-Auth-Timestamp"), "1700000000");
});

test("hasAuthContext accepts signed header auth without token", () => {
    const env = {
        FVC_HEADER_X_USER_ID: "user-1",
        FVC_HEADER_X_USER_SIGNATURE: "sig-1",
        FVC_HEADER_X_USER_TIMESTAMP: "1700000000",
        FVC_HEADER_X_USER_NONCE: "nonce-1",
    };

    assert.equal(hasSignedHeaderAuth(env), true);
    assert.equal(hasAuthContext({}, env), true);
});

function restoreEnv(key, value) {
    if (value === undefined) {
        delete process.env[key];
    } else {
        process.env[key] = value;
    }
}
