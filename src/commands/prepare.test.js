import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const { __test } = await import("./prepare.js");

test("prepare builds modelscope model command", () => {
    const command = __test.buildPrepareCommand(
        "model",
        {
            source: "modelscope",
            id: "Qwen/Qwen1.5-0.5B-Chat",
            revision: "master",
            include: ["README.md", " config.json "],
        },
        "/resources/models/qwen"
    );

    assert.deepEqual(command, {
        command: "modelscope",
        args: [
            "download",
            "--model",
            "Qwen/Qwen1.5-0.5B-Chat",
            "--revision",
            "master",
            "README.md",
            "config.json",
            "--local_dir",
            "/resources/models/qwen",
        ],
    });
});

test("prepare builds huggingface dataset command", () => {
    const command = __test.buildPrepareCommand(
        "dataset",
        {
            source: "huggingface",
            id: "tatsu-lab/alpaca",
            include: ["*.json"],
            exclude: ["*.zip"],
        },
        "/resources/datasets/alpaca"
    );

    assert.deepEqual(command, {
        command: "hf",
        args: [
            "download",
            "tatsu-lab/alpaca",
            "--repo-type",
            "dataset",
            "--include",
            "*.json",
            "--exclude",
            "*.zip",
            "--local-dir",
            "/resources/datasets/alpaca",
        ],
    });
});

test("prepare loads platform-seed config and merges seedDirs", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mindreon-prepare-test-"));
    await fs.mkdir(path.join(root, "seeds", "models"), { recursive: true });
    await fs.mkdir(path.join(root, "seeds", "datasets"), { recursive: true });
    await fs.writeFile(
        path.join(root, "config.yaml"),
        `
resourcesDir: ${path.join(root, "resources")}
seedDirs:
  - seeds/models
  - seeds/datasets
models:
  - name: base-model
`
    );
    await fs.writeFile(
        path.join(root, "seeds", "models", "10-model.yaml"),
        `
models:
  - name: seed-model
    prepare:
      source: huggingface
      id: org/seed-model
`
    );
    await fs.writeFile(
        path.join(root, "seeds", "datasets", "10-dataset.yaml"),
        `
datasets:
  - name: seed-dataset
`
    );

    const cfg = await __test.loadPrepareConfig(path.join(root, "config.yaml"));
    assert.equal(cfg.models.length, 2);
    assert.equal(cfg.models[0].name, "base-model");
    assert.equal(cfg.models[1].name, "seed-model");
    assert.equal(cfg.models[1].prepare.source, "huggingface");
    assert.equal(cfg.datasets.length, 1);
    assert.equal(cfg.datasets[0].name, "seed-dataset");
});

test("prepare uses stable hidden temp path next to target", () => {
    assert.equal(
        __test.prepareTempPath("/resources/models/Qwen2.5-7B-Instruct"),
        "/resources/models/.Qwen2.5-7B-Instruct.prepare"
    );
});
