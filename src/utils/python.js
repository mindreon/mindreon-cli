import { delimiter } from "node:path";
import process from "node:process";
import { tryCommand } from "./shell.js";

export function getPythonCommand() {
    const candidates =
        process.platform === "win32"
            ? [
                { command: "python", prefixArgs: [] },
                { command: "py", prefixArgs: ["-3"] },
                { command: "python3", prefixArgs: [] },
            ]
            : [
                { command: "python3", prefixArgs: [] },
                { command: "python", prefixArgs: [] },
            ];

    for (const candidate of candidates) {
        if (tryCommand(candidate.command, [...candidate.prefixArgs, "--version"]).status === 0) {
            return candidate;
        }
    }

    return null;
}

export function tryPythonModule(moduleName, args = [], options = {}) {
    const python = getPythonCommand();
    if (python === null) {
        return { status: 1, stdout: "", stderr: "Python 3 is unavailable." };
    }

    return tryCommand(python.command, [...python.prefixArgs, "-m", moduleName, ...args], options);
}

export function getPythonUserScriptsDir() {
    const python = getPythonCommand();
    if (python === null) {
        return "";
    }

    const script = "import os, sysconfig; scheme = 'nt_user' if os.name == 'nt' else 'posix_user'; print(sysconfig.get_path('scripts', scheme=scheme) or '')";
    const result = tryCommand(python.command, [...python.prefixArgs, "-c", script]);

    if (result.status !== 0) {
        return "";
    }

    return (result.stdout || "").trim();
}

export function prependPathEntry(entry) {
    const normalizedEntry = String(entry || "").trim();
    if (!normalizedEntry) {
        return;
    }

    const pathKey = process.platform === "win32" ? "Path" : "PATH";
    const currentPath = process.env[pathKey] || process.env.PATH || "";
    const entries = currentPath.split(delimiter).filter(Boolean);
    if (entries.includes(normalizedEntry)) {
        return;
    }

    process.env[pathKey] = [normalizedEntry, ...entries].join(delimiter);
    process.env.PATH = process.env[pathKey];
}

export function ensurePythonUserScriptsOnPath() {
    prependPathEntry(getPythonUserScriptsDir());
}
