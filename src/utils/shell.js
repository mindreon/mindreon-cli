import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

function normalizeOptions(options = {}) {
    return {
        cwd: options.cwd || process.cwd(),
        env: options.env || process.env,
        encoding: "utf-8",
        ...options,
    };
}

function formatFailure(command, args, result) {
    const stderr = (result.stderr || "").trim();
    const prefix = `Command failed: ${command} ${args.join(" ")}`;
    return stderr ? `${prefix}\n${stderr}` : prefix;
}

export function runCommand(command, args = [], options = {}) {
    const result = spawnSync(command, args, {
        ...normalizeOptions(options),
        stdio: options.stdio || "inherit",
    });

    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(formatFailure(command, args, result));
    }

    return result;
}

export function captureCommand(command, args = [], options = {}) {
    const result = spawnSync(command, args, {
        ...normalizeOptions(options),
        stdio: ["ignore", "pipe", "pipe"],
    });

    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(formatFailure(command, args, result));
    }

    return (result.stdout || "").trim();
}

export function tryCommand(command, args = [], options = {}) {
    return spawnSync(command, args, {
        ...normalizeOptions(options),
        stdio: ["ignore", "pipe", "pipe"],
    });
}

export function runCommandStreaming(command, args = [], options = {}) {
    const normalizedOptions = normalizeOptions(options);
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: normalizedOptions.cwd,
            env: normalizedOptions.env,
            shell: options.shell || false,
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (chunk) => {
            process.stdout.write(chunk);
            stdout += chunk;
        });

        child.stderr.on("data", (chunk) => {
            process.stderr.write(chunk);
            stderr += chunk;
        });

        child.on("error", reject);
        child.on("close", (status, signal) => {
            resolve({ status, signal, stdout, stderr });
        });
    });
}

export function commandExists(command) {
    const lookupCommand = process.platform === "win32" ? "where" : "bash";
    const lookupArgs = process.platform === "win32" ? [command] : ["-lc", `command -v ${command}`];
    const result = spawnSync(lookupCommand, lookupArgs, {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
    });
    return result.status === 0;
}
