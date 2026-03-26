import { parseArgs } from "../cli/args.js";
import { commandExists, runCommand } from "../utils/shell.js";

function parseBooleanOption(value, defaultValue) {
    if (value === undefined || value === null || value === "") {
        return defaultValue;
    }

    if (typeof value === "boolean") {
        return value;
    }

    const normalized = String(value).trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(normalized)) {
        return true;
    }
    if (["0", "false", "no", "n", "off"].includes(normalized)) {
        return false;
    }

    throw new Error(`Invalid boolean value: ${value}`);
}

function normalizeImageRef(ref, label) {
    const value = String(ref || "").trim();
    if (!value) {
        throw new Error(`${label} image is required.`);
    }
    return value.startsWith("docker://") ? value : `docker://${value}`;
}

function formatCommand(args) {
    return args
        .map((arg) => (/\s/.test(arg) ? JSON.stringify(arg) : arg))
        .join(" ");
}

export async function runImage({ argv }) {
    const args = parseArgs(argv);
    const subCommand = args._[0] || "";
    const implicitCopy = subCommand && subCommand !== "copy";

    if (subCommand === "push") {
        throw new Error("Unknown image command: push. Use 'mindreon image copy <src> <dst>' instead.");
    }

    const src = args.from || args.src || (implicitCopy ? args._[0] : args._[1]) || "";
    const dst = args.to || args.dst || (implicitCopy ? args._[1] : args._[2]) || "";

    if (!src || !dst) {
        throw new Error("Usage: mindreon image copy <src> <dst>");
    }

    const skopeoArgs = [
        "copy",
        "--all",
        `--src-tls-verify=${parseBooleanOption(args["src-tls-verify"], false)}`,
        `--dest-tls-verify=${parseBooleanOption(args["dest-tls-verify"], false)}`,
        normalizeImageRef(src, "Source"),
        normalizeImageRef(dst, "Destination"),
    ];

    if (args["dry-run"]) {
        console.log(`skopeo ${formatCommand(skopeoArgs)}`);
        return;
    }

    if (!commandExists("skopeo")) {
        throw new Error("skopeo is required for image copy. Please install skopeo first.");
    }

    console.log(`Copying image from ${src} to ${dst}...`);
    runCommand("skopeo", skopeoArgs);
    console.log(`Image copy completed: ${dst}`);
}
