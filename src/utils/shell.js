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

const SENSITIVE_FLAGS = new Set([
    "--password",
    "--token",
    "--access-key-id",
    "--secret-access-key",
    "--session-token",
]);

function traceValueEnabled(value) {
    return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function shouldTraceCommand(options, normalizedOptions, defaultTrace) {
    if (options.traceCommand === false) {
        return false;
    }
    const requested = options.traceCommand === true || defaultTrace;
    if (!requested) {
        return false;
    }
    const env = normalizedOptions.env || process.env;
    return traceValueEnabled(env.MINDREON_TRACE_COMMANDS || env.MINDREON_LOG_SUBCOMMANDS);
}

function maskArg(value) {
    return String(value || "")
        .replace(/([a-z][a-z0-9+.-]*:\/\/)([^/\s@]+)@/gi, "$1***@")
        .replace(/(access_key_id=)[^&\s]+/gi, "$1******")
        .replace(/(secret_access_key=)[^&\s]+/gi, "$1******")
        .replace(/(session_token=)[^&\s]+/gi, "$1******");
}

function shellQuote(value) {
    const text = String(value);
    if (/^[A-Za-z0-9_./:=@%+,-]+$/.test(text)) {
        return text;
    }
    return `'${text.replace(/'/g, "'\\''")}'`;
}

function formatCommandForLog(command, args = []) {
    const maskedArgs = [];
    for (let i = 0; i < args.length; i += 1) {
        const raw = String(args[i]);
        const [flagName] = raw.split("=", 1);
        if (SENSITIVE_FLAGS.has(raw) && i + 1 < args.length) {
            maskedArgs.push(raw);
            maskedArgs.push("******");
            i += 1;
            continue;
        }
        if (SENSITIVE_FLAGS.has(flagName) && raw.includes("=")) {
            maskedArgs.push(`${flagName}=******`);
            continue;
        }
        maskedArgs.push(maskArg(raw));
    }
    return [command, ...maskedArgs].map(shellQuote).join(" ");
}

function traceCommand(command, args, options, normalizedOptions, defaultTrace = false) {
    if (!shouldTraceCommand(options, normalizedOptions, defaultTrace)) {
        return;
    }
    console.log(`run external command (cwd=${normalizedOptions.cwd}): ${formatCommandForLog(command, args)}`);
}

export function runCommand(command, args = [], options = {}) {
    const normalizedOptions = normalizeOptions(options);
    traceCommand(command, args, options, normalizedOptions, true);
    const result = spawnSync(command, args, {
        ...normalizedOptions,
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
    const normalizedOptions = normalizeOptions(options);
    traceCommand(command, args, options, normalizedOptions);
    return spawnSync(command, args, {
        ...normalizedOptions,
        stdio: ["ignore", "pipe", "pipe"],
    });
}

export function runCommandStreaming(command, args = [], options = {}) {
    const normalizedOptions = normalizeOptions(options);
    traceCommand(command, args, options, normalizedOptions, true);
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
