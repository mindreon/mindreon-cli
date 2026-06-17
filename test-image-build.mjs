#!/usr/bin/env node
// One-off test script — not committed to repo
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { saveConfig } from "./src/cli/config.js";

const BASE_URL = "https://dev-4-13.mindreon.com";
const CWD = new URL(".", import.meta.url).pathname;

async function login() {
    process.stdout.write("Logging in...\n");
    const resp = await fetch(`${BASE_URL}/iam/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "orgadmin", password: "mindreon@123" }),
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
    process.stdout.write("=== Mindreon Image Build CLI Test ===\n\n");

    await login();

    // ── [1/3] registry_pull ─────────────────────────────────────────────────
    process.stdout.write("\n[1/3] registry_pull\n");
    const out1 = runCLI([
        "image", "build",
        "--repo", "test-iam-base",
        "--tag", "v1",
        "--method", "registry_pull",
        "--source-image", "harbor.mindreon.com/ops/iam-service-base:latest",
        "--source-username", "admin",
        "--source-password", "Mindreon@2025",
        "--remarks", "CLI test - registry_pull",
    ], { hideArgs: ["--source-password"] });
    process.stdout.write(`${out1}\n`);

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
    process.stdout.write("\n[3/3] upload (postgres-17.tar)\n");
    const tarPath = "/Users/hejinglang/codeFiles/projects/mindreon/postgres-17.tar";

    const uploadOut2 = runCLI([
        "file", "upload", tarPath,
        "--scope", "personal",
        "--remote-path", "/builds/test/postgres-17.tar",
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

    process.stdout.write("\n=== All 3 build tasks submitted ===\n");
}

main().catch((err) => {
    process.stderr.write(`\nError: ${err.message}\n`);
    process.exit(1);
});
