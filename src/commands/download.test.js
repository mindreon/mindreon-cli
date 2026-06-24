import test from "node:test";
import assert from "node:assert/strict";

import { __test } from "./download.js";

test("download batch targets include models datasets and workloads", () => {
    assert.deepEqual(
        __test.buildBatchTargets(
            {
                models: "qwen:main",
                datasets: "alpaca:train",
                workloads: "dev-demo",
            },
            {}
        ),
        [
            { resourceType: "model", resourceName: "qwen", version: "main", rootSubdir: "models" },
            { resourceType: "dataset", resourceName: "alpaca", version: "train", rootSubdir: "datasets" },
            { resourceType: "workload", resourceName: "dev-demo", version: "", rootSubdir: "workloads" },
        ]
    );
});

test("download batch targets read fvc envs", () => {
    assert.deepEqual(__test.buildBatchTargets({}, { FVC_MODELS: "qwen:main", FVC_WORKLOADS: "dev:main" }), [
        { resourceType: "model", resourceName: "qwen", version: "main", rootSubdir: "models" },
        { resourceType: "workload", resourceName: "dev", version: "main", rootSubdir: "workloads" },
    ]);
});
