import process from "node:process";
import { parseArgs } from "../cli/args.js";
import { commandExists, runCommand, tryCommand } from "../utils/shell.js";

function hasGitLfs() {
    return tryCommand("git", ["lfs", "version"]).status === 0;
}

function hasDvc() {
    return tryCommand("dvc", ["version"]).status === 0;
}

function hasPython3() {
    return commandExists("python3");
}

function hasPipForPython3() {
    return tryCommand("python3", ["-m", "pip", "--version"]).status === 0;
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

function getStatusRows() {
    return [
        ["git", commandExists("git")],
        ["git-lfs", hasGitLfs()],
        ["python3", hasPython3()],
        ["python3-pip", hasPipForPython3()],
        ["dvc", hasDvc()],
    ];
}

function printStatus() {
    for (const [name, installed] of getStatusRows()) {
        console.log(`${installed ? "OK" : "MISSING"}  ${name}`);
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

    throw new Error("Unsupported platform or missing package manager. Install git, git-lfs, python3, and dvc[s3] manually.");
}

function installDvc() {
    if (!hasPython3()) {
        throw new Error("python3 is required to install dvc[s3].");
    }

    const baseArgs = ["-m", "pip", "install"];
    const installArgs =
        typeof process.getuid === "function" && process.getuid() === 0
            ? [...baseArgs, "dvc[s3]"]
            : [...baseArgs, "--user", "dvc[s3]"];

    let result = tryCommand("python3", installArgs);
    if (result.status === 0) {
        return;
    }

    const stderr = `${result.stderr || ""}\n${result.stdout || ""}`;
    if (stderr.includes("externally-managed-environment")) {
        const retryArgs =
            typeof process.getuid === "function" && process.getuid() === 0
                ? [...baseArgs, "--break-system-packages", "dvc[s3]"]
                : [...baseArgs, "--user", "--break-system-packages", "dvc[s3]"];
        runCommand("python3", retryArgs);
        return;
    }

    throw new Error(
        stderr.trim() || "Failed to install dvc[s3]."
    );
}

export async function runInstall({ argv }) {
    const args = parseArgs(argv);
    const checkOnly = Boolean(args.check);

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
        const packageManager = detectPackageManager();
        installSystemPackages(packageManager, missingSystemPackages);
    } else {
        console.log("All required system packages are already installed.");
    }

    if (!hasDvc()) {
        console.log("Installing dvc[s3]...");
        installDvc();
    } else {
        console.log("dvc is already installed.");
    }

    if (!hasGitLfs()) {
        throw new Error("git-lfs is still unavailable after installation.");
    }

    if (commandExists("git")) {
        runCommand("git", ["lfs", "install"]);
    }

    console.log("Current dependency status:");
    printStatus();
    console.log("Dependency installation completed.");
}
