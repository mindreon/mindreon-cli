import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ensureDvcConfig, saveWorkspaceCredentials } from "./workspace.js";
import { readIni } from "./ini.js";

async function withTempWorkspace(fn) {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "mindreon-workspace-"));
    try {
        await fs.mkdir(path.join(cwd, ".dvc"), { recursive: true });
        await fn(cwd);
    } finally {
        await fs.rm(cwd, { recursive: true, force: true });
    }
}

test("ensureDvcConfig 覆盖旧的 remote/core 配置", async () => {
    await withTempWorkspace(async (cwd) => {
        await fs.writeFile(
            path.join(cwd, ".dvc", "config"),
            [
                "[core]",
                "remote = legacy",
                "autostage = false",
                "",
                "[cache]",
                "type = hardlink",
                "",
                "[remote \"storage\"]",
                "url = s3://old-bucket/old-prefix",
                "endpointurl = https://old-endpoint",
                "",
            ].join("\n"),
            "utf-8"
        );

        await ensureDvcConfig(cwd, { bucket: "ai-nexus", prefix: "tenant/demo/project/p1/fvm/storage/123" }, "123");

        const config = await readIni(path.join(cwd, ".dvc", "config"));
        assert.equal(config.core.remote, "storage");
        assert.equal(config.core.autostage, "true");
        assert.equal(config.cache.type, "hardlink");
        assert.deepEqual(config['remote "storage"'], {
            url: "s3://ai-nexus/tenant/demo/project/p1/fvm/storage/123",
        });
    });
});

test("saveWorkspaceCredentials 覆盖旧的 config.local remote 凭证配置", async () => {
    await withTempWorkspace(async (cwd) => {
        await fs.writeFile(
            path.join(cwd, ".dvc", "config.local"),
            [
                "[remote \"storage\"]",
                "endpointurl = https://old.example.com/jfs-s3",
                "access_key_id = old-ak",
                "secret_access_key = old-sk",
                "profile = old-profile",
                "",
            ].join("\n"),
            "utf-8"
        );

        await saveWorkspaceCredentials(cwd, {
            fvsId: "123",
            bindType: "model",
            bindName: "demo",
            version: "main",
            creds: {
                endpointUrl: "https://new.example.com/jfs-s3",
                accessKeyId: "new-ak",
                secretAccessKey: "new-sk",
                sessionToken: "new-token",
                region: "us-east-1",
            },
        });

        const localConfig = await readIni(path.join(cwd, ".dvc", "config.local"));
        assert.deepEqual(localConfig['remote "storage"'], {
            endpointurl: "https://new.example.com/jfs-s3-v1",
            access_key_id: "new-ak",
            secret_access_key: "new-sk",
            session_token: "new-token",
            region: "us-east-1",
        });
    });
});
