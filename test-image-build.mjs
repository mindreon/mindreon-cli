#!/usr/bin/env node
// One-off test script — not committed to repo
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { saveConfig } from "./src/cli/config.js";

const RUN_E2E = process.env.MINDREON_RUN_IMAGE_BUILD_TEST === "1";
const BASE_URL = process.env.MINDREON_API_URL || "https://dev-4-13.mindreon.com";
const USERNAME = process.env.MINDREON_AUTH_USERNAME || "";
const PASSWORD = process.env.MINDREON_AUTH_PASSWORD || "";
const REGISTRY_USERNAME = process.env.MINDREON_IMAGE_SOURCE_USERNAME || "";
const REGISTRY_PASSWORD = process.env.MINDREON_IMAGE_SOURCE_PASSWORD || "";
const TAR_PATH = process.env.MINDREON_IMAGE_BUILD_TAR || "";
const CWD = new URL(".", import.meta.url).pathname;

async function login() {
    if (!USERNAME || !PASSWORD) {
        throw new Error("Set MINDREON_AUTH_USERNAME and MINDREON_AUTH_PASSWORD before running image build e2e.");
    }

    process.stdout.write("Logging in...\n");
    const resp = await fetch(`${BASE_URL}/iam/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    });
    const data = await resp.json();
    const token = data?.data?.accessToken || data?.data?.token;
    if (!token) throw new Error(`Login failed: ${JSON.stringify(data)}`);
    await saveConfig({ url: BASE_URL, token });
    process.stdout.write("✓ Logged in, token saved\n");
    return token;
}

function runCLI(args, { hideArgs = [] } = {}) {
    const printArgs = args.map((a, i) =>
        hideArgs.includes(args[i - 1]) ? "***" : a
    );
    process.stdout.write(`  $ node src/index.js ${printArgs.join(" ")}\n`);
    const result = spawnSync("node", ["src/index.js", ...args], {
        cwd: CWD,
        encoding: "utf8",
        timeout: 600000, // 10 min for large uploads
    });
    const stdout = (result.stdout || "").trim();
    const stderr = (result.stderr || "").trim();
    if (result.status !== 0) {
        throw new Error(`CLI failed (exit ${result.status}):\n${stderr || stdout}`);
    }
    return stdout;
}

function extractDownloadUrl(cliOutput) {
    const match = cliOutput.match(/Download URL:\s*(\S+)/);
    if (!match) throw new Error(`Cannot find Download URL in output:\n${cliOutput}`);
    return match[1];
}

async function main() {
    if (!RUN_E2E) {
        process.stdout.write("Skipping image build e2e. Set MINDREON_RUN_IMAGE_BUILD_TEST=1 to enable.\n");
        return;
    }

    process.stdout.write("=== Mindreon Image Build CLI Test ===\n\n");

    await login();

    // ── [1/3] registry_pull ─────────────────────────────────────────────────
    process.stdout.write("\n[1/3] registry_pull\n");
    if (REGISTRY_USERNAME && REGISTRY_PASSWORD) {
        const out1 = runCLI([
            "image", "build",
            "--repo", "test-iam-base",
            "--tag", "v1",
            "--method", "registry_pull",
            "--source-image", "harbor.mindreon.com/ops/iam-service-base:latest",
            "--source-username", REGISTRY_USERNAME,
            "--source-password", REGISTRY_PASSWORD,
            "--remarks", "CLI test - registry_pull",
        ], { hideArgs: ["--source-password"] });
        process.stdout.write(`${out1}\n`);
    } else {
        process.stdout.write("  Skipped. Set MINDREON_IMAGE_SOURCE_USERNAME and MINDREON_IMAGE_SOURCE_PASSWORD to enable.\n");
    }

    // ── [2/3] dockerfile ────────────────────────────────────────────────────
    process.stdout.write("\n[2/3] dockerfile\n");

    const dockerfileContent = [
        "FROM alpine:3.19",
        'RUN echo "Mindreon build test" > /etc/motd',
        'CMD ["cat", "/etc/motd"]',
        "",
    ].join("\n");
    const tmpDockerfile = "/tmp/Dockerfile.mindreon-test";
    await fs.writeFile(tmpDockerfile, dockerfileContent);

    process.stdout.write("  Uploading Dockerfile...\n");
    const uploadOut1 = runCLI([
        "file", "upload", tmpDockerfile,
        "--scope", "personal",
        "--remote-path", "/builds/test/Dockerfile",
    ]);
    process.stdout.write(`${uploadOut1}\n`);
    const dockerfileUrl = extractDownloadUrl(uploadOut1);

    const out2 = runCLI([
        "image", "build",
        "--repo", "test-dockerfile",
        "--tag", "v1",
        "--method", "dockerfile",
        "--dockerfile-url", dockerfileUrl,
        "--remarks", "CLI test - dockerfile",
    ]);
    process.stdout.write(`${out2}\n`);

    // ── [3/3] upload (tar) ──────────────────────────────────────────────────
    process.stdout.write("\n[3/3] upload (tar)\n");
    if (!TAR_PATH) {
        process.stdout.write("  Skipped. Set MINDREON_IMAGE_BUILD_TAR to enable.\n");
        process.stdout.write("\n=== Image build e2e finished ===\n");
        return;
    }

    await fs.access(TAR_PATH);

    const uploadOut2 = runCLI([
        "file", "upload", TAR_PATH,
        "--scope", "personal",
        "--remote-path", `/builds/test/${path.basename(TAR_PATH)}`,
    ]);
    process.stdout.write(`${uploadOut2}\n`);
    const fileUrl = extractDownloadUrl(uploadOut2);

    const out3 = runCLI([
        "image", "build",
        "--repo", "test-postgres",
        "--tag", "17",
        "--method", "upload",
        "--file-url", fileUrl,
        "--remarks", "CLI test - upload",
    ]);
    process.stdout.write(`${out3}\n`);

    process.stdout.write("\n=== Image build e2e finished ===\n");
}

main().catch((err) => {
    process.stderr.write(`\nError: ${err.message}\n`);
    process.exit(1);
});
