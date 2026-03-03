import { parseArgs } from "../cli/args.js";
import { request } from "../api/client.js";

export async function runModel({ argv }) {
    const args = parseArgs(argv);
    const subCommand = args._[0];

    if (subCommand === "create") {
        const name = args.name;
        const displayName = args.displayName || name;
        const description = args.description || "";

        if (!name) {
            throw new Error("Usage: mindreon-mcp model create --name <name> [--displayName <name>] [--description <desc>]");
        }

        console.log(`Creating model: ${name}`);
        const response = await request("/model-service/api/v1/models", {
            method: "POST",
            body: { name, displayName, description },
        });

        console.log("Model created successfully.");
        console.log(response.data || response);
        return;
    }

    if (subCommand === "create-version") {
        const modelName = args.model;
        const version = args.version;

        if (!modelName || !version) {
            throw new Error("Usage: mindreon-mcp model create-version --model <name> --version <version>");
        }

        console.log(`Creating version ${version} for model ${modelName}`);
        // "branch" is expected by model-service
        const response = await request(`/model-service/api/v1/models/${modelName}/versions`, {
            method: "POST",
            body: { branch: version },
        });

        console.log("Model version created successfully.");
        console.log(response.data || response);
        return;
    }

    if (subCommand === "append-file") {
        const modelName = args.model;
        const version = args.version;
        const location = args.location;
        const dest = args.dest;
        const message = args.message || "Append file via mindreon-mcp";

        if (!modelName || !version || !location || !dest) {
            throw new Error("Usage: mindreon-mcp model append-file --model <name> --version <version> --location <loc> --dest <path>");
        }

        console.log(`Appending file to model ${modelName}@${version}`);
        const response = await request(`/model-service/api/v1/models/${modelName}/versions/${version}/append`, {
            method: "POST",
            body: {
                message,
                files: [
                    {
                        location,
                        dest,
                    }
                ]
            },
        });

        console.log("File appended successfully.");
        return;
    }

    throw new Error(`Unknown model command: ${subCommand}`);
}
