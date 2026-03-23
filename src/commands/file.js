import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "../cli/args.js";
import { resolveBaseUrl } from "../api/client.js";
import { loadConfig } from "../cli/config.js";
import { getServicePrefix } from "../utils/routes.js";

// A custom fetch wrapper that gets raw response to read headers
async function fetchRaw(endpoint, options = {}) {
    const config = await loadConfig();
    const baseUrl = resolveBaseUrl(config);

    const headers = new Headers();
    if (config.token) {
        headers.set("Authorization", `Bearer ${config.token}`);
    }
    if (options.headers) {
        Object.entries(options.headers).forEach(([k, v]) => headers.set(k, v));
    }

    const url = `${baseUrl}${endpoint}`;
    const response = await fetch(url, {
        method: options.method || "GET",
        headers,
        body: options.body
    });

    return response;
}

export async function runFile({ argv }) {
    const args = parseArgs(argv);
    const subCommand = args._[0];

    if (subCommand === "upload") {
        const filePath = args._[1];
        const bucket = args.bucket || args.b || "files";
        const config = await loadConfig();
        const filesPrefix = getServicePrefix("files", resolveBaseUrl(config));

        if (!filePath) {
            throw new Error("Usage: mindreon-mcp file upload <file_path> [--bucket <bucket>]");
        }

        const stat = await fs.stat(filePath);
        const fileName = path.basename(filePath);

        // TUS create
        const metaStr = `filename ${Buffer.from(fileName).toString("base64")}`;
        const createResp = await fetchRaw(`${filesPrefix}/uploads/${bucket}/`, {
            method: "POST",
            headers: {
                "Tus-Resumable": "1.0.0",
                "Upload-Length": stat.size.toString(),
                "Upload-Metadata": metaStr
            }
        });

        if (createResp.status !== 201) {
            throw new Error(`Failed to create TUS upload: ${createResp.status} ${createResp.statusText}`);
        }

        let location = createResp.headers.get("Location");
        if (!location) {
            throw new Error("Missing Location header in TUS create response");
        }

        // If location is full URL, extract path
        if (location.startsWith("http")) {
            const urlObj = new URL(location);
            location = urlObj.pathname;
        }
        // ensure prefix
        if (!location.startsWith(filesPrefix)) {
            if (location.startsWith("/uploads/")) {
                location = `${filesPrefix}${location}`;
            }
        }

        console.log(`Created TUS upload task: ${location}`);

        // Read file and PATCH
        const fileBuffer = await fs.readFile(filePath);
        const patchResp = await fetchRaw(location, {
            method: "PATCH",
            headers: {
                "Tus-Resumable": "1.0.0",
                "Upload-Offset": "0",
                "Content-Type": "application/offset+octet-stream"
            },
            body: fileBuffer
        });

        if (patchResp.status !== 204) {
            throw new Error(`Failed to upload file chunks: ${patchResp.status} ${patchResp.statusText}`);
        }

        // Now format the internal location expected by other services like model-service
        // e.g. "s3://..." or "http://file-server/..." based on your typical infra.
        // If the services just expect the location string returned for FVM appending,
        // We return it for the user/agent. However FVM typically wants `location: string`.
        // We output the file location as simple format.
        const fileId = location.split("/").pop();

        const finalLocation = `file-server://${bucket}/${fileId}`;
        console.log(`Successfully uploaded: ${fileName}`);
        console.log(`Location: ${finalLocation}`);

        return { location: finalLocation };
    }

    throw new Error(`Unknown file command: ${subCommand}`);
}
