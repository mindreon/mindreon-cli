import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const configHome = await fs.mkdtemp(path.join(os.tmpdir(), "mindreon-create-test-"));
process.env.XDG_CONFIG_HOME = configHome;

const { runCreate } = await import("./create.js");

const envKeys = [
    "MINDREON_API_URL",
    "MINDREON_MODEL_URL",
    "MINDREON_DATASET_URL",
    "MINDREON_MODEL_PREFIX",
    "MINDREON_DATASET_PREFIX",
    "MINDREON_EXTERNAL",
    "MINDREON_AUTH_TOKEN",
];

async function withCapturedCreateRequest(env, argv) {
    const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
    const originalFetch = globalThis.fetch;
    const originalLog = console.log;
    const calls = [];

    for (const key of envKeys) {
        delete process.env[key];
    }
    Object.assign(process.env, env);
    process.env.MINDREON_AUTH_TOKEN = process.env.MINDREON_AUTH_TOKEN || "test-token";

    globalThis.fetch = async (url, options) => {
        calls.push({ url: String(url), options });
        return new Response(JSON.stringify({ code: 0, msg: "success", data: { ok: true } }), {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    };
    console.log = () => {};

    try {
        await runCreate({ argv });
        return calls;
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

test("create model 默认走外部网关前缀", async () => {
    const calls = await withCapturedCreateRequest({}, ["--model", "Qwen2.5-7B-Instruct", "--preset"]);

    assert.equal(calls[0].url, "https://dev-4-13.mindreon.com/model-service/api/v1/models");
});

test("create dataset 使用外部网关 dataset 前缀", async () => {
    const calls = await withCapturedCreateRequest(
        { MINDREON_API_URL: "https://dev-4-13.mindreon.com" },
        ["--dataset", "demo-dataset", "--preset"]
    );

    assert.equal(calls[0].url, "https://dev-4-13.mindreon.com/dsv/api/v1/datasets");
});

test("create model 配置内网服务地址时直连 model-service", async () => {
    const calls = await withCapturedCreateRequest(
        {
            MINDREON_API_URL: "http://baize-frontend.default.svc.cluster.local",
            MINDREON_MODEL_URL: "http://model-service.default.svc.cluster.local",
        },
        ["--model", "Qwen2.5-7B-Instruct", "--preset"]
    );

    assert.equal(calls[0].url, "http://model-service.default.svc.cluster.local/api/v1/models");
});

test("create dataset 配置内网服务地址时直连 datacube-service", async () => {
    const calls = await withCapturedCreateRequest(
        {
            MINDREON_API_URL: "http://baize-frontend.default.svc.cluster.local",
            MINDREON_DATASET_URL: "http://datacube-service.default.svc.cluster.local",
        },
        ["--dataset", "demo-dataset", "--preset"]
    );

    assert.equal(calls[0].url, "http://datacube-service.default.svc.cluster.local/api/v1/datasets");
});
