import { parseArgs } from "../cli/args.js";
import { request } from "../api/client.js";

export async function runDataset({ argv }) {
    const args = parseArgs(argv);
    const subCommand = args._[0];

    if (subCommand === "create") {
        const name = args.name;
        const displayName = args.displayName || name;
        const description = args.description || "";

        if (!name) {
            throw new Error("Usage: mindreon-mcp dataset create --name <name> [--displayName <name>] [--description <desc>]");
        }

        console.log(`Creating dataset: ${name}`);
        const response = await request("/dataset-service/api/v1/datasets", {
            method: "POST",
            body: { name, displayName, description },
        });

        // Dataset service responds with standard wrapped or direct. Assumed wrapped parsed in client.js
        console.log("Dataset created successfully.");
        console.log(response.data || response);
        return;
    }

    if (subCommand === "create-version") {
        const datasetName = args.dataset;
        const version = args.version;

        if (!datasetName || !version) {
            throw new Error("Usage: mindreon-mcp dataset create-version --dataset <name> --version <version>");
        }

        console.log(`Creating version ${version} for dataset ${datasetName}`);
        const response = await request(`/dataset-service/api/v1/datasets/${datasetName}/versions`, {
            method: "POST",
            body: { version },
        });

        console.log("Dataset version created successfully.");
        console.log(response.data || response);
        return;
    }

    if (subCommand === "append-file") {
        const datasetName = args.dataset;
        const version = args.version;
        const location = args.location;
        const dest = args.dest;
        const message = args.message || "Append file via mindreon-mcp";

        if (!datasetName || !version || !location || !dest) {
            throw new Error("Usage: mindreon-mcp dataset append-file --dataset <name> --version <version> --location <loc> --dest <path>");
        }

        console.log(`Appending file to dataset ${datasetName}@${version}`);
        const response = await request(`/dataset-service/api/v1/datasets/${datasetName}/versions/${version}/files`, {
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

    throw new Error(`Unknown dataset command: ${subCommand}`);
}
