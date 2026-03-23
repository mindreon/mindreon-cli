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

function printStatus() {
    const rows = [
        ["git", commandExists("git")],
        ["git-lfs", hasGitLfs()],
        ["python3", hasPython3()],
        ["dvc", hasDvc()],
    ];

    for (const [name, installed] of rows) {
        console.log(`${installed ? "OK" : "MISSING"}  ${name}`);
    }
}

function installSystemPackages(packageManager) {
    if (packageManager === "brew") {
        runCommand("brew", ["install", "git", "git-lfs", "python3"]);
        return;
    }
    if (packageManager === "apt-get") {
        runMaybeSudo("apt-get", ["update"]);
        runMaybeSudo("apt-get", ["install", "-y", "git", "git-lfs", "python3", "python3-pip"]);
        return;
    }
    if (packageManager === "dnf") {
        runMaybeSudo("dnf", ["install", "-y", "git", "git-lfs", "python3", "python3-pip"]);
        return;
    }
    if (packageManager === "yum") {
        runMaybeSudo("yum", ["install", "-y", "git", "git-lfs", "python3", "python3-pip"]);
        return;
    }

    throw new Error("Unsupported platform or missing package manager. Install git, git-lfs, python3, and dvc[s3] manually.");
}

function installDvc() {
    if (!hasPython3()) {
        throw new Error("python3 is required to install dvc[s3].");
    }
    runCommand("python3", ["-m", "pip", "install", "--user", "dvc[s3]"]);
}

export async function runInstall({ argv }) {
    const args = parseArgs(argv);
    const checkOnly = Boolean(args.check);

    printStatus();
    if (checkOnly) {
        return;
    }

    const packageManager = detectPackageManager();
    installSystemPackages(packageManager);

    if (!hasDvc()) {
        installDvc();
    }

    if (!hasGitLfs()) {
        throw new Error("git-lfs is still unavailable after installation.");
    }

    runCommand("git", ["lfs", "install"]);
    console.log("Dependency installation completed.");
}
