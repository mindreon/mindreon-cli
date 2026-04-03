function normalizeName(value) {
    return String(value || "").trim();
}

export function resolveResourceTarget(args) {
    const modelName = normalizeName(args.model);
    const datasetName = normalizeName(args.dataset);

    if (modelName && datasetName) {
        throw new Error("Use exactly one resource flag: --model <name> or --dataset <name>.");
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

    throw new Error("Missing resource target. Use --model <name> or --dataset <name>.");
}
