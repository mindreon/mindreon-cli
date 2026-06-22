import process from "node:process";
import { parseArgs } from "../cli/args.js";
import { commandExists, runCommand, runCommandStreaming, tryCommand } from "../utils/shell.js";
import { hasDvc } from "../utils/dvc.js";
import { ensurePythonUserScriptsOnPath, getPythonCommand } from "../utils/python.js";

const WINDOWS_PACKAGE_IDS = {
    git: "Git.Git",
    "git-lfs": "GitHub.GitLFS",
    python3: "Python.Python.3.13",
    "python3-pip": "Python.Python.3.13",
};

const MANUAL_INSTALL_COMMANDS = {
    darwin: [
        "brew install git git-lfs python3",
        'python3 -m pip install --user "dvc[s3]"',
        "git lfs install",
    ],
    linuxApt: [
        "sudo apt-get update",
        "sudo apt-get install -y git git-lfs python3 python3-pip",
        'python3 -m pip install --user --break-system-packages "dvc[s3]"',
        "git lfs install",
    ],
    linuxDnf: [
        "sudo dnf install -y git git-lfs python3 python3-pip",
        'python3 -m pip install --user "dvc[s3]"',
        "git lfs install",
    ],
    win32: [
        "winget install --id Git.Git --exact --source winget",
        "winget install --id GitHub.GitLFS --exact --source winget",
        "winget install --id Python.Python.3.13 --exact --source winget",
        'python -m pip install --user "dvc[s3]"',
        "git lfs install",
    ],
};

const DVC_PATH_HINTS = {
    win32: "If pip installed dvc but the dvc command is unavailable, add %APPDATA%\\Python\\Python313\\Scripts to PATH and reopen the terminal.",
    default: "If pip installed dvc but the dvc command is unavailable, add your Python user bin directory to PATH and reopen the terminal.",
};

function hasGitLfs() {
    return tryCommand("git", ["lfs", "version"]).status === 0;
}

function hasPython3() {
    return getPythonCommand() !== null;
}

function hasPipForPython3() {
    const python = getPythonCommand();
    return python !== null && tryCommand(python.command, [...python.prefixArgs, "-m", "pip", "--version"]).status === 0;
}

function hasSkopeo() {
    return commandExists("skopeo");
}

function hasModelScope() {
    return commandExists("modelscope");
}

function hasHuggingFaceCli() {
    return commandExists("hf") || commandExists("huggingface-cli");
}

function getInstallPrefix() {
    const uid = typeof process.getuid === "function" ? process.getuid() : null;
    if (uid === 0 || process.platform === "darwin") {
        return [];
    }
    return commandExists("sudo") ? ["sudo"] : [];
}

function runMaybeSudo(command, args) {
    const prefix = getInstallPrefix();
    if (prefix.length === 0) {
        runCommand(command, args);
        return;
    }
    runCommand(prefix[0], [command, ...args]);
}

function detectPackageManager() {
    if (process.platform === "win32" && commandExists("winget")) {
        return "winget";
    }
    if (process.platform === "darwin" && commandExists("brew")) {
        return "brew";
    }
    if (process.platform === "linux" && commandExists("apt-get")) {
        return "apt-get";
    }
    if (process.platform === "linux" && commandExists("dnf")) {
        return "dnf";
    }
    if (process.platform === "linux" && commandExists("yum")) {
        return "yum";
    }
    return "";
}

function getManualInstallCommands(packageManager = detectPackageManager()) {
    if (process.platform === "win32") {
        return MANUAL_INSTALL_COMMANDS.win32;
    }
    if (process.platform === "darwin") {
        return MANUAL_INSTALL_COMMANDS.darwin;
    }
    if (process.platform === "linux" && packageManager === "apt-get") {
        return MANUAL_INSTALL_COMMANDS.linuxApt;
    }
    if (process.platform === "linux") {
        return MANUAL_INSTALL_COMMANDS.linuxDnf;
    }
    return [
        "Install git, git-lfs, Python 3, pip, and dvc[s3] with your system package manager.",
        'python3 -m pip install --user "dvc[s3]"',
        "git lfs install",
    ];
}

function formatManualInstallAdvice(packageManager = detectPackageManager()) {
    return [
        "Manual install commands:",
        ...getManualInstallCommands(packageManager).map((command) => `  ${command}`),
    ].join("\n");
}

function getDvcPathHint() {
    return DVC_PATH_HINTS[process.platform] || DVC_PATH_HINTS.default;
}

function getStatusRows() {
    return [
        { name: "git", installed: commandExists("git"), optional: false },
        { name: "git-lfs", installed: hasGitLfs(), optional: false },
        { name: "python3", installed: hasPython3(), optional: false },
        { name: "python3-pip", installed: hasPipForPython3(), optional: false },
        { name: "dvc", installed: hasDvc(), optional: false },
        { name: "modelscope", installed: hasModelScope(), optional: true },
        { name: "huggingface-cli", installed: hasHuggingFaceCli(), optional: true },
        { name: "skopeo", installed: hasSkopeo(), optional: true },
    ];
}

function printStatus() {
    for (const { name, installed, optional } of getStatusRows()) {
        if (installed) {
            console.log(`OK  ${name}${optional ? " (optional)" : ""}`);
            continue;
        }
        console.log(`${optional ? "OPTIONAL" : "MISSING"}  ${name}`);
    }
}

function installSystemPackages(packageManager, missingPackages) {
    if (missingPackages.length === 0) {
        return;
    }

    if (packageManager === "brew") {
        runCommand("brew", ["install", ...missingPackages]);
        return;
    }
    if (packageManager === "apt-get") {
        runMaybeSudo("apt-get", ["update"]);
        runMaybeSudo("apt-get", ["install", "-y", ...missingPackages]);
        return;
    }
    if (packageManager === "dnf") {
        runMaybeSudo("dnf", ["install", "-y", ...missingPackages]);
        return;
    }
    if (packageManager === "yum") {
        runMaybeSudo("yum", ["install", "-y", ...missingPackages]);
        return;
    }
    if (packageManager === "winget") {
        const packageIds = [...new Set(missingPackages.map((name) => WINDOWS_PACKAGE_IDS[name] || name))];
        for (const packageId of packageIds) {
            runCommand("winget", [
                "install",
                "--id",
                packageId,
                "--exact",
                "--source",
                "winget",
                "--accept-package-agreements",
                "--accept-source-agreements",
            ]);
        }
        return;
    }

    throw new Error("Unsupported platform or missing package manager. Install git, git-lfs, python3, and dvc[s3] manually.");
}

function formatCommand(command, args) {
    return [command, ...args].join(" ");
}

async function installDvc() {
    const python = getPythonCommand();
    if (python === null) {
        throw new Error(`Python 3 is required to install dvc[s3].\n${formatManualInstallAdvice()}`);
    }

    const baseArgs = ["-m", "pip", "install"];
    const installArgs =
        typeof process.getuid === "function" && process.getuid() === 0
            ? [...baseArgs, "dvc[s3]"]
            : [...baseArgs, "--user", "dvc[s3]"];

    console.log(`Running: ${formatCommand(python.command, [...python.prefixArgs, ...installArgs])}`);
    console.log("Pip output:");
    let result = await runCommandStreaming(python.command, [...python.prefixArgs, ...installArgs]);
    if (result.status === 0) {
        ensurePythonUserScriptsOnPath();
        return;
    }

    const stderr = `${result.stderr || ""}\n${result.stdout || ""}`;
    if (stderr.includes("externally-managed-environment")) {
        const retryArgs =
            typeof process.getuid === "function" && process.getuid() === 0
                ? [...baseArgs, "--break-system-packages", "dvc[s3]"]
                : [...baseArgs, "--user", "--break-system-packages", "dvc[s3]"];
        console.log("Retrying with --break-system-packages because this Python environment is externally managed.");
        console.log(`Running: ${formatCommand(python.command, [...python.prefixArgs, ...retryArgs])}`);
        result = await runCommandStreaming(python.command, [...python.prefixArgs, ...retryArgs]);
        if (result.status !== 0) {
            const retryStderr = `${result.stderr || ""}\n${result.stdout || ""}`;
            throw new Error(
                `${retryStderr.trim() || "Failed to install dvc[s3]."}\n${formatManualInstallAdvice()}`
            );
        }
        ensurePythonUserScriptsOnPath();
        return;
    }

    throw new Error(
        `${stderr.trim() || "Failed to install dvc[s3]."}\n${formatManualInstallAdvice()}`
    );
}

export async function runInstall({ argv }) {
    const args = parseArgs(argv);
    const checkOnly = Boolean(args.check);
    const skipSkopeo = Boolean(args["skip-skopeo"]);
    const packageManager = detectPackageManager();

    printStatus();
    if (checkOnly) {
        return;
    }

    const missingSystemPackages = [];
    if (!commandExists("git")) missingSystemPackages.push("git");
    if (!hasGitLfs()) missingSystemPackages.push("git-lfs");
    if (!hasPython3()) missingSystemPackages.push("python3");
    if (!hasPipForPython3()) missingSystemPackages.push("python3-pip");

    if (missingSystemPackages.length > 0) {
        console.log(`Installing missing system packages: ${missingSystemPackages.join(", ")}`);
        try {
            installSystemPackages(packageManager, missingSystemPackages);
        } catch (error) {
            const message = error?.message || String(error);
            throw new Error(`${message}\n\n${formatManualInstallAdvice(packageManager)}`);
        }
    } else {
        console.log("All required system packages are already installed.");
    }

    if (!hasDvc()) {
        console.log("Installing dvc[s3]...");
        await installDvc();
        if (!hasDvc()) {
            throw new Error(`dvc is still unavailable after installation.\n${getDvcPathHint()}\n${formatManualInstallAdvice(packageManager)}`);
        }
    } else {
        console.log("dvc is already installed.");
    }

    if (!hasGitLfs()) {
        throw new Error(`git-lfs is still unavailable after installation.\n${formatManualInstallAdvice(packageManager)}`);
    }

    if (commandExists("git")) {
        runCommand("git", ["lfs", "install"]);
    }

    if (skipSkopeo) {
        console.log("Skipping optional skopeo installation.");
    } else if (hasSkopeo()) {
        console.log("skopeo is already installed.");
    } else {
        console.log("Installing optional package: skopeo...");
        try {
            installSystemPackages(packageManager, ["skopeo"]);
            if (hasSkopeo()) {
                console.log("skopeo installation completed.");
            } else {
                console.log("Warning: skopeo install command completed but skopeo is still unavailable.");
            }
        } catch (error) {
            const message = error?.message || String(error);
            console.log(`Warning: failed to install optional skopeo. ${message}`);
        }
    }

    console.log("Current dependency status:");
    printStatus();
    console.log("Dependency installation completed.");
}
