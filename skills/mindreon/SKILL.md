---
name: mindreon
description: 使用 mindreon-mcp 命令行工具，帮助 Agent 直接在本地集成 IAM 登录、上传文件、管理模型与数据集，以及调度 AI 测试训练工作流。
homepage: https://github.com/sanmu2018/mindreon-mcp
metadata: {"openclaw":{"emoji":"🚀","install":[{"id":"node","kind":"node","package":"@sanmu2018/mindreon-mcp","bins":["mindreon-mcp"],"label":"Install mindreon-mcp CLI (node)"}]}}
---

# mindreon (Mindreon MCP CLI)

## When to use this skill

当用户需要：
- 登录认证 Mindreon 平台
- 上传文件到 file-service
- 创建/管理数据集和模型 (dataset-service / model-service)
- 启动/调度各种 AI 任务（如推理服务、训练任务、开发环境）(ai-nexus)

## Installation

由于目前是以本地项目形式存在，可以在本目录执行 `npm link` 来安装全局命令 `mindreon-mcp`。

## Workflows

### 1. 登录 (Login)
首先，通过以下命令进行登录。登录成功后 Token 将会自动保存在本地。
```bash
mindreon-mcp login --username <USERNAME> --password <PASSWORD> [--url https://dev-4-13.mindreon.com]
```

### 2. 文件上传 (File Upload)
将本地的文件上传至对象存储，并获取文件 location：
```bash
mindreon-mcp file upload <LOCAL_FILE_PATH> --bucket <BUCKET_NAME>
# BUCKET_NAME 常规选项有：images, docs, files, models
```
输出将会展示类似于：`Location: file-server://files/xxxxx`。在接下来的接口中，这会被用作 `location`。

### 3. 模型管理 (Model Management)
创建模型：
```bash
mindreon-mcp model create --name "my-cool-model" --description "A fresh new model"
```
创建版本（branch）：
```bash
mindreon-mcp model create-version --model "my-cool-model" --version "v1.0.0"
```
向模型版本追加文件 (使用刚才上传的 location)：
```bash
mindreon-mcp model append-file --model "my-cool-model" --version "v1.0.0" --location "file-server://files/xxxx" --dest "weights.safetensors"
```

### 4. 数据集管理 (Dataset Management)
创建数据集与发布版本的逻辑同上：
```bash
mindreon-mcp dataset create --name "my-test-data"
mindreon-mcp dataset create-version --dataset "my-test-data" --version "v1"
mindreon-mcp dataset append-file --dataset "my-test-data" --version "v1" --location "file-server://files/yyyy" --dest "train.jsonl"
```

### 5. 任务调度 (Workload: AI Nexus)
启动推理服务：
```bash
mindreon-mcp workload create-infer --name "infer-test" --model "my-cool-model" --modelVersion "v1.0.0" --cpu 4 --memory "8G" --gpu 1
```

启动训练任务：
```bash
mindreon-mcp workload create-training --name "train-test" --dataset "my-test-data" --datasetVersion "v1" --pretrainModel "my-cool-model" --pretrainModelVersion "v1.0.0" --cpu 4 --memory "16G" --gpu 1
```
*(开发环境命令类似：`mindreon-mcp workload create-dev --name "dev-1" --image "ubuntu:latest" --cpu 2`)*

## Tips
1. 所有的创建或修改命令都会在控制台向外打印出 JSON 对象响应。Agent 可以从中读取出需要的系统 ID 或状态。
2. 内部 API 报错时均会直接按照 `Error: <msg>` 的格式向标准错误输出报错内容，并结束进程 `exit(1)`。
