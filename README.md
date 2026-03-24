# Mindreon CLI

Mindreon CLI 提供登录、模型与数据集管理、本地 Git/DVC 工作区操作，以及 workload 调度能力。

## 安装

全局安装：

```bash
npm i -g @sanmu2018/mindreon-mcp
mindreon --help
```

从源码本地安装：

```bash
cd /path/to/mindreon-mcp
npm link
mindreon --help
```

安装后统一使用 `mindreon` 命令。

## 常用命令

### 登录

```bash
mindreon login
mindreon login --username <USERNAME> --password <PASSWORD> [--url https://your-domain]
```

直接执行 `mindreon login` 会进入交互式输入流程。登录成功后，Token 会保存在 `~/.config/mindreon/config.json`。

### 模型管理

```bash
mindreon model create --name "my-model" --description "demo model"
mindreon model version create --name "my-model" --version "v1" --base "main"
mindreon model connect --name "my-model" --version "v1"
```

### 数据集管理

```bash
mindreon dataset create --name "my-dataset"
mindreon dataset version create --name "my-dataset" --version "v1" --base "main"
mindreon dataset connect --name "my-dataset" --version "v1"
```

### 本地仓库工作流

```bash
mindreon install
mindreon repo pull
mindreon repo add
mindreon repo add --threshold 1
mindreon repo commit -m "update assets"
mindreon repo push
```

说明：
- `repo add` 默认把大于 `5 MiB` 的文件交给 `dvc add`
- `--threshold` 单位是 `MiB`

### 任务调度

```bash
mindreon workload create-infer --name "infer-test" --model "my-model" --modelVersion "v1" --cpu 4 --memory "8G" --gpu 1
mindreon workload create-training --name "train-test" --dataset "my-dataset" --datasetVersion "v1" --pretrainModel "my-model" --pretrainModelVersion "v1" --cpu 4 --memory "16G" --gpu 1
```

## 查看帮助

```bash
mindreon help
mindreon repo --help
```
