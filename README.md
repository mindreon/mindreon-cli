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
- `mindreon install` 会检查并安装 `git`、`git-lfs`、`python3`、`python3-pip` 和 `dvc[s3]`
- 对于已经安装好的依赖，会直接提示已安装并跳过，不会重复安装
- `repo add` 默认把大于 `5 MiB` 的文件交给 `dvc add`
- `--threshold` 单位是 `MiB`

手动安装建议：

- macOS
```bash
brew install git git-lfs python3
python3 -m pip install --user "dvc[s3]"
git lfs install
```

- Ubuntu / Debian
```bash
sudo apt-get update
sudo apt-get install -y git git-lfs python3 python3-pip
python3 -m pip install --user "dvc[s3]"
git lfs install
```

- RHEL / CentOS / Rocky / AlmaLinux
```bash
sudo dnf install -y git git-lfs python3 python3-pip
python3 -m pip install --user "dvc[s3]"
git lfs install
```

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

## 发布到 npm

发布前检查：

```bash
cd /path/to/mindreon-mcp
git status --short
npm whoami
node -p "require('./package.json').version"
```

GitHub Actions 发布：

```bash
cd /path/to/mindreon-mcp
mindreon release patch --skip-github-release --skip-publish
```

这条命令会：
- 更新版本号
- 提交版本变更
- 创建并推送 `v*` tag
- 由 `.github/workflows/publish-npm.yml` 在 tag push 时自动发布到 npm

如果不想自动 bump，也可以手动打 tag：

```bash
git tag v0.1.2
git push origin v0.1.2
```

本地手动发布：

```bash
cd /path/to/mindreon-mcp
npm run pack
npm publish --access public
```

自动发版并发布：

```bash
cd /path/to/mindreon-mcp
mindreon release patch
mindreon release minor
mindreon release major
```

说明：
- 上面这组命令是本地发布路径，会继续执行 `gh release create` 和 `npm publish`
- 如果想只打 tag 交给 GitHub Actions 发布，请加 `--skip-github-release --skip-publish`

版本含义：
- `patch`：小修复，不改现有用法，例如 `0.1.0 -> 0.1.1`
- `minor`：新增功能但兼容旧用法，例如 `0.1.0 -> 0.2.0`
- `major`：不兼容变更，例如删命令或改参数语义
