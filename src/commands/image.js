import { parseArgs } from "../cli/args.js";
import { commandExists, runCommand } from "../utils/shell.js";
import { request, resolveBaseUrl } from "../api/client.js";
import { loadConfig } from "../cli/config.js";
import { getServicePrefix } from "../utils/routes.js";

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

async function runBuildTask(args) {
    const repo = args.repo || args.repository || "";
    const tag = args.tag || "";
    const method = args.method || "";
    const visibility = args.visibility || "";
    const remarks = args.remarks || "";
    const tagSlugsRaw = args["tag-slugs"] || "";

    if (!repo) {
        throw new Error("--repo is required.");
    }
    if (!tag) {
        throw new Error("--tag is required.");
    }
    const validMethods = ["dockerfile", "upload", "registry_pull"];
    if (!method) {
        throw new Error(`--method is required. Use one of: ${validMethods.join(", ")}`);
    }
    if (!validMethods.includes(method)) {
        throw new Error(`Invalid --method "${method}". Use one of: ${validMethods.join(", ")}`);
    }
    if (visibility && !["private", "public"].includes(visibility)) {
        throw new Error(`Invalid --visibility "${visibility}". Use "private" or "public".`);
    }

    const body = {
        targetRepository: repo,
        targetTag: tag,
        buildMethod: method,
    };

    if (visibility) {
        body.visibility = visibility;
    }
    if (remarks) {
        body.remarks = remarks;
    }
    if (tagSlugsRaw) {
        body.tagSlugs = String(tagSlugsRaw)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
    }

    if (method === "dockerfile") {
        const dockerfileUrl = args["dockerfile-url"] || "";
        body.dockerfile = { dockerfileUrl };
    } else if (method === "upload") {
        const fileUrl = args["file-url"] || "";
        if (!fileUrl) {
            throw new Error("--file-url is required when --method is upload.");
        }
        body.upload = { fileUrl };
    } else if (method === "registry_pull") {
        const sourceImage = args["source-image"] || "";
        if (!sourceImage) {
            throw new Error("--source-image is required when --method is registry_pull.");
        }
        body.registryPull = { sourceImage };
        if (args["source-username"]) {
            body.registryPull.sourceUsername = args["source-username"];
        }
        if (args["source-password"]) {
            body.registryPull.sourcePassword = args["source-password"];
        }
    }

    const config = await loadConfig();
    const baseUrl = resolveBaseUrl(config);
    const prefix = getServicePrefix("image", baseUrl);
    const response = await request(`${prefix}/api/v1/images/build-tasks`, {
        method: "POST",
        body,
    });

    const task = response?.data || response;
    console.log(`Build task created: ${task.id || JSON.stringify(task)}`);
    if (task.targetImage) {
        console.log(`Target image: ${task.targetImage}`);
    }
    if (task.status) {
        console.log(`Status: ${task.status}`);
    }
    return task;
}

export async function runImage({ argv }) {
    const args = parseArgs(argv);
    const subCommand = args._[0] || "";

    if (subCommand === "build") {
        const buildArgs = parseArgs(argv.slice(1));
        return runBuildTask(buildArgs);
    }

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
