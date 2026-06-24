import test from "node:test";
import assert from "node:assert/strict";

import { parseBatchItems, resolveResourceTarget, sanitizeResourceDirName } from "./resource-target.js";

test("resolveResourceTarget supports workload", () => {
    assert.deepEqual(resolveResourceTarget({ workload: "dev-demo" }), {
        resourceType: "workload",
        resourceName: "dev-demo",
    });
});

test("parseBatchItems parses name branch pairs", () => {
    assert.deepEqual(parseBatchItems("qwen:main, llama:v2, alpaca"), [
        { name: "qwen", version: "main" },
        { name: "llama", version: "v2" },
        { name: "alpaca", version: "" },
    ]);
});

test("sanitizeResourceDirName keeps fvc-compatible names", () => {
    assert.equal(sanitizeResourceDirName("org/repo:v1 beta"), "org__repo__v1_beta");
});
