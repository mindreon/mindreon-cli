function normalizeName(value) {
    return String(value || "").trim();
}

export function resolveResourceTarget(args) {
    const modelName = normalizeName(args.model);
    const datasetName = normalizeName(args.dataset);
    const workloadName = normalizeName(args.workload);
    const selected = [
        ["model", modelName],
        ["dataset", datasetName],
        ["workload", workloadName],
    ].filter(([, name]) => name);

    if (selected.length > 1) {
        throw new Error("Use exactly one resource flag: --model <name>, --dataset <name>, or --workload <name>.");
    }

    if (modelName) {
        return {
            resourceType: "model",
            resourceName: modelName,
        };
    }

    if (datasetName) {
        return {
            resourceType: "dataset",
            resourceName: datasetName,
        };
    }

    if (workloadName) {
        return {
            resourceType: "workload",
            resourceName: workloadName,
        };
    }

    throw new Error("Missing resource target. Use --model <name>, --dataset <name>, or --workload <name>.");
}

export function parseBatchItems(raw) {
    return String(raw || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => {
            const separator = item.indexOf(":");
            if (separator === -1) {
                return { name: item, version: "" };
            }
            return {
                name: item.slice(0, separator).trim(),
                version: item.slice(separator + 1).trim(),
            };
        })
        .filter((item) => item.name);
}

export function sanitizeResourceDirName(name) {
    return String(name || "")
        .replaceAll("/", "__")
        .replaceAll(":", "__")
        .replace(/[^A-Za-z0-9._-]/g, "_");
}
