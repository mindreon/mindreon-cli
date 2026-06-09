import { commandExists, runCommand, tryCommand } from "./shell.js";
import { getPythonCommand, tryPythonModule } from "./python.js";

function getDvcUnavailableMessage() {
    return [
        "dvc is unavailable.",
        'Run "mindreon install" first, or install it manually:',
        '  python -m pip install --user "dvc[s3]"',
        "If dvc was installed with pip but is not on PATH, reopen the terminal or keep using Mindreon CLI; it can fall back to python -m dvc.",
    ].join("\n");
}

export function resolveDvcCommand(options = {}) {
    if (commandExists("dvc") && tryCommand("dvc", ["version"], options).status === 0) {
        return { command: "dvc", prefixArgs: [] };
    }

    const python = getPythonCommand();
    if (python !== null && tryPythonModule("dvc", ["version"], options).status === 0) {
        return { command: python.command, prefixArgs: [...python.prefixArgs, "-m", "dvc"] };
    }

    return null;
}

export function hasDvc(options = {}) {
    return resolveDvcCommand(options) !== null;
}

export function tryDvc(args = [], options = {}) {
    const dvc = resolveDvcCommand(options);
    if (dvc === null) {
        return { status: 1, stdout: "", stderr: getDvcUnavailableMessage() };
    }

    return tryCommand(dvc.command, [...dvc.prefixArgs, ...args], options);
}

export function runDvc(args = [], options = {}) {
    const dvc = resolveDvcCommand(options);
    if (dvc === null) {
        throw new Error(getDvcUnavailableMessage());
    }

    return runCommand(dvc.command, [...dvc.prefixArgs, ...args], options);
}
