import { spawnSync } from "node:child_process";

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

export function commandExists(command) {
    const result = spawnSync("bash", ["-lc", `command -v ${command}`], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
    });
    return result.status === 0;
}
