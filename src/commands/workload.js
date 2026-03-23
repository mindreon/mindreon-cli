import { parseArgs } from "../cli/args.js";
import { request, resolveBaseUrl } from "../api/client.js";
import { loadConfig } from "../cli/config.js";
import { getServicePrefix } from "../utils/routes.js";

function parseResource(args) {
    return {
        cpu: args.cpu ? Number(args.cpu) : 1,
        memory: args.memory || "1G",
        gpu: args.gpu ? Number(args.gpu) : 0,
    };
}

export async function runWorkload({ argv }) {
    const args = parseArgs(argv);
    const subCommand = args._[0];
    const apiPrefix = getServicePrefix("workload", resolveBaseUrl(await loadConfig()));

    if (subCommand === "create-training") {
        const name = args.name;
        if (!name) throw new Error("Usage: mindreon-mcp workload create-training --name <name> [options]");

        const body = {
            name: name,
            baseImage: args.baseImage || "",
            algorithm: args.algorithm || "",
            algorithmVersion: args.algorithmVersion || "",
            dataset: args.dataset || "",
            datasetVersion: args.datasetVersion || "",
            pretrainModel: args.pretrainModel || "",
            pretrainModelVersion: args.pretrainModelVersion || "",
            hyperparameters: args.hyperparameters ? JSON.parse(args.hyperparameters) : {},
            workerConfig: {
                replicas: args.replicas ? Number(args.replicas) : 1,
                ...parseResource(args)
            }
        };

        console.log(`Creating training workload: ${name}`);
        const response = await request(`${apiPrefix}/api/v1/workloads/train`, {
            method: "POST",
            body,
        });

        console.log("Training workload created successfully.");
        console.log(response.data || response);
        return;
    }

    if (subCommand === "create-dev") {
        const name = args.name;
        if (!name) throw new Error("Usage: mindreon-mcp workload create-dev --name <name> [options]");

        const body = {
            name: name,
            image: args.image || "ubuntu:latest",
            resource: parseResource(args)
        };

        console.log(`Creating dev workspace: ${name}`);
        const response = await request(`${apiPrefix}/api/v1/workloads/dev`, {
            method: "POST",
            body,
        });

        console.log("Dev workspace created successfully.");
        console.log(response.data || response);
        return;
    }

    if (subCommand === "create-infer") {
        const name = args.name;
        if (!name) throw new Error("Usage: mindreon-mcp workload create-infer --name <name> --model <model> --modelVersion <version> [options]");

        const body = {
            name: name,
            model: args.model,
            modelVersion: args.modelVersion,
            image: args.image || "",
            resource: parseResource(args)
        };

        console.log(`Creating infer service: ${name}`);
        const response = await request(`${apiPrefix}/api/v1/workloads/infer`, {
            method: "POST",
            body,
        });

        console.log("Infer service created successfully.");
        console.log(response.data || response);
        return;
    }

    if (subCommand === "list") {
        const kind = args.kind || "Job";
        console.log(`Listing workloads (kind: ${kind})...`);
        const response = await request(`${apiPrefix}/api/v1/workloads?kind=${kind}`, { method: "GET" });
        console.log(response.data || response);
        return;
    }

    throw new Error(`Unknown workload command: ${subCommand}`);
}
