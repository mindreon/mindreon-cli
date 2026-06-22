import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const configHome = await fs.mkdtemp(path.join(os.tmpdir(), "mindreon-config-center-test-"));
process.env.XDG_CONFIG_HOME = configHome;

const { runParameterTemplate, runRuntimeConfig } = await import("./config-center.js");

const envKeys = [
    "MINDREON_API_URL",
    "MINDREON_AI_NEXUS_URL",
    "MINDREON_AI_NEXUS_PREFIX",
    "MINDREON_EXTERNAL",
    "MINDREON_AUTH_TOKEN",
];

async function withCapturedExistsRequest(env, command, argv, exists = true) {
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
        return new Response(JSON.stringify({ code: 0, msg: "success", data: { exists } }), {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    };
    console.log = () => {};

    try {
        await command({ argv });
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

test("runtime-config exists 默认走 ai-nexus 外部网关前缀", async () => {
    const calls = await withCapturedExistsRequest(
        { MINDREON_API_URL: "https://dev-4-13.mindreon.com" },
        runRuntimeConfig,
        ["exists", "--name", "qwen-sft-default", "--source", "preset"]
    );

    assert.equal(
        calls[0].url,
        "https://dev-4-13.mindreon.com/ai-nexus/api/v1/runtime-configs/exists?name=qwen-sft-default&source=preset"
    );
});

test("parameter-template exists 配置内网服务地址时直连 ai-nexus", async () => {
    const calls = await withCapturedExistsRequest(
        {
            MINDREON_API_URL: "http://baize-frontend.default.svc.cluster.local",
            MINDREON_AI_NEXUS_URL: "http://ai-nexus.default.svc.cluster.local",
        },
        runParameterTemplate,
        ["exists", "--name", "qwen-lora-default"]
    );

    assert.equal(
        calls[0].url,
        "http://ai-nexus.default.svc.cluster.local/api/v1/parameter-templates/exists?name=qwen-lora-default"
    );
});

test("runtime-config exists 不存在时返回退出码 2", async () => {
    await assert.rejects(
        withCapturedExistsRequest({}, runRuntimeConfig, ["exists", "--name", "missing"], false),
        (error) => {
            assert.equal(error.exitCode, 2);
            return true;
        }
    );
});
