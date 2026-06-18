import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "../cli/args.js";
import { resolveBaseUrl } from "../api/client.js";
import { loadConfig } from "../cli/config.js";
import { getServicePrefix } from "../utils/routes.js";

function buildTusMeta(pairs) {
    return Object.entries(pairs)
        .map(([k, v]) => `${k} ${Buffer.from(String(v)).toString("base64")}`)
        .join(",");
}

export async function uploadFileToWorkspace(filePath, options = {}) {
    const scope = options.scope || "personal";
    const remotePath = options.remotePath || `/${path.basename(filePath)}`;

    const config = await loadConfig();
    const baseUrl = resolveBaseUrl(config);
    const prefix = getServicePrefix("file-center", baseUrl);
    const token = process.env.MINDREON_AUTH_TOKEN || config.token || "";

    if (!token) {
        throw new Error("Not logged in. Run 'mindreon login' first.");
    }

    const stat = await fs.stat(filePath);
    const fileName = path.basename(filePath);

    const meta = buildTusMeta({
        scope,
        relativePath: remotePath,
        override: "true",
    });

    // TUS Create
    const createResp = await fetch(`${baseUrl}${prefix}/api/v1/tus/`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Tus-Resumable": "1.0.0",
            "Upload-Length": String(stat.size),
            "Upload-Metadata": meta,
            "Content-Length": "0",
        },
    });

    if (createResp.status !== 201) {
        const text = await createResp.text();
        throw new Error(`TUS create failed (${createResp.status}): ${text.slice(0, 200)}`);
    }

    const rawLocation = createResp.headers.get("location") || "";
    // The gateway strips the service prefix from the Location header returned by file-center TUS.
    // e.g. Location: https://host/api/v1/tus/<id>  →  needs to become /file-center/api/v1/tus/<id>
    let patchUrl;
    if (rawLocation.startsWith("http")) {
        const locPath = new URL(rawLocation).pathname;
        patchUrl = locPath.startsWith(prefix)
            ? rawLocation
            : `${baseUrl}${prefix}${locPath}`;
    } else {
        patchUrl = `${baseUrl}${rawLocation}`;
    }

    process.stdout.write(`Uploading ${fileName} (${(stat.size / 1024 / 1024).toFixed(1)} MB)...\n`);

    // TUS Patch
    const fileData = await fs.readFile(filePath);
    const patchResp = await fetch(patchUrl, {
        method: "PATCH",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Tus-Resumable": "1.0.0",
            "Upload-Offset": "0",
            "Content-Type": "application/offset+octet-stream",
            "Content-Length": String(stat.size),
        },
        body: fileData,
    });

    if (patchResp.status !== 204) {
        const text = await patchResp.text();
        throw new Error(`TUS patch failed (${patchResp.status}): ${text.slice(0, 200)}`);
    }

    const downloadUrl = `${baseUrl}${prefix}/api/v1/resources/download?scope=${scope}&paths=${encodeURIComponent(remotePath)}`;

    console.log(`Successfully uploaded: ${fileName}`);
    console.log(`Remote path: ${remotePath}`);
    console.log(`Download URL: ${downloadUrl}`);

    return { url: downloadUrl, path: remotePath, scope };
}

export async function runFile({ argv }) {
    const args = parseArgs(argv);
    const subCommand = args._[0];

    if (subCommand === "upload") {
        const filePath = args._[1];
        if (!filePath) {
            throw new Error("Usage: mindreon file upload <file_path> [--scope personal|project] [--remote-path /path]");
        }

        return uploadFileToWorkspace(filePath, {
            scope: args.scope || "personal",
            remotePath: args["remote-path"] || args.path || `/${path.basename(filePath)}`,
        });
    }

    throw new Error(`Unknown file command: ${subCommand}. Available: upload`);
}
