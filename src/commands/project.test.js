import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CONFIG_FILE } from "../cli/config.js";

const configHome = await fs.mkdtemp(path.join(os.tmpdir(), "mindreon-project-test-"));
process.env.XDG_CONFIG_HOME = configHome;

const { runProject } = await import("./project.js");

const envKeys = [
    "MINDREON_API_URL",
    "MINDREON_EXTERNAL",
    "MINDREON_AUTH_TOKEN",
];

async function writeTestConfig(data) {
    await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true });
    await fs.writeFile(CONFIG_FILE, JSON.stringify(data), "utf-8");
}

async function runProjectWithMock(argv, beforeFn) {
    const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
    const originalFetch = globalThis.fetch;
    const originalLog = console.log;
    const calls = [];
    const logs = [];

    for (const key of envKeys) {
        delete process.env[key];
    }
    
    console.log = (...args) => {
        logs.push(args.join(" "));
    };

    globalThis.fetch = async (url, options) => {
        calls.push({ url: String(url), options });
        const rawUrl = String(url);
        if (rawUrl.includes("/api/v1/users/current")) {
            return new Response(JSON.stringify({
                code: 0,
                msg: "success",
                data: {
                    user: {
                        id: "test-user-id",
                        currentProject: {
                            id: "proj-1",
                            name: "Project-1"
                        },
                        projects: [
                            { id: "proj-1", name: "Project-1" },
                            { id: "proj-2", name: "Project-2" }
                        ],
                        tenant: {
                            name: "test-tenant"
                        }
                    }
                }
            }), {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        }
        if (rawUrl.includes("/default-project")) {
            return new Response(JSON.stringify({
                code: 0,
                msg: "success",
                data: {
                    tokenRefreshed: true,
                    tokens: {
                        accessToken: "new-mocked-jwt-token"
                    }
                }
            }), {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        }
        return new Response(JSON.stringify({ code: 0, msg: "success", data: {} }), {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    };

    if (beforeFn) {
        await beforeFn();
    }

    try {
        await runProject({ argv });
        return { calls, logs };
    } finally {
        globalThis.fetch = originalFetch;
        console.log = originalLog;
        for (const key of envKeys) {
            const value = originalEnv.get(key);
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    }
}

test("runProject throws error when not logged in", async () => {
    const originalToken = process.env.MINDREON_AUTH_TOKEN;
    delete process.env.MINDREON_AUTH_TOKEN;
    await writeTestConfig({});

    try {
        await assert.rejects(
            runProject({ argv: [] }),
            /No active session found. Please login first/
        );
    } finally {
        if (originalToken !== undefined) {
            process.env.MINDREON_AUTH_TOKEN = originalToken;
        }
    }
});

test("project list prints project lists and highlights active project", async () => {
    await writeTestConfig({ token: "existing-token" });

    const { calls, logs } = await runProjectWithMock(["list"]);

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/v1\/users\/current/);
    
    const logsStr = logs.join("\n");
    assert.match(logsStr, /Current Tenant: test-tenant/);
    assert.match(logsStr, /\* Project-1.*active/);
    assert.match(logsStr, /  Project-2/);
});

test("project use switches user default project and saves new token", async () => {
    await writeTestConfig({ token: "existing-token" });

    const { calls, logs } = await runProjectWithMock(["use", "Project-2"]);

    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /\/api\/v1\/users\/current/);
    assert.match(calls[1].url, /\/api\/v1\/users\/test-user-id\/default-project/);
    assert.equal(calls[1].options.method, "PUT");
    assert.deepEqual(JSON.parse(calls[1].options.body), { defaultProjectId: "proj-2" });

    const logsStr = logs.join("\n");
    assert.match(logsStr, /Successfully switched to project 'Project-2'/);

    const configData = await fs.readFile(CONFIG_FILE, "utf-8");
    const config = JSON.parse(configData);
    assert.equal(config.token, "new-mocked-jwt-token");
});
