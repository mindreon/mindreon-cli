# Mindreon CLI

`mindreon` 是 Mindreon 的命令行工具，用来完成模型或数据集仓库的本地协作流程：

- 安装依赖
- 登录平台
- 连接模型或数据集
- 拉取仓库内容
- 修改文件
- 提交代码
- 推送代码和 DVC 数据

## 安装 CLI

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

## 第一步：安装依赖

执行：

```bash
mindreon install
```

这个命令会检查并安装：

- `git`
- `git-lfs`
- `python3`
- `python3-pip`
- `dvc[s3]`

说明：

- 已安装的依赖会自动跳过
- 在 Debian / Ubuntu 这类启用了 PEP 668 的环境里，命令会在必要时自动改用 `pip --break-system-packages`

如果你想先只看依赖状态：

```bash
mindreon install --check
```

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
python3 -m pip install --user --break-system-packages "dvc[s3]"
git lfs install
```

如果你不想改系统 Python，也可以手动使用 `pipx`：

```bash
sudo apt-get install -y pipx
pipx install "dvc[s3]"
```

- RHEL / CentOS / Rocky / AlmaLinux

```bash
sudo dnf install -y git git-lfs python3 python3-pip
python3 -m pip install --user "dvc[s3]"
git lfs install
```

## 第二步：登录

执行交互式登录：

```bash
mindreon login
```

也可以直接传参数：

```bash
mindreon login --url https://your-domain --username <USERNAME> --password <PASSWORD>
```

## 第三步：连接模型或数据集

### 连接模型

```bash
mindreon model connect --name "Qwen2.5-7B-Instruct" --version "main"
```

### 连接数据集

```bash
mindreon dataset connect --name "my-dataset" --version "main"
```

说明：

- `connect` 会在当前目录下新建一个同名工作目录
- `connect` 只做本地初始化，不会自动拉取远端文件
- 成功后会提示下一步该 `cd` 到哪个目录

如果你想手动指定目录：

```bash
mindreon model connect --name "Qwen2.5-7B-Instruct" --version "main" --dir ./workspace/model
```

## 第四步：拉取仓库内容

进入 `connect` 提示的目录后执行：

```bash
cd ./Qwen2.5-7B-Instruct
mindreon repo pull
```

这一步会做：

- 刷新 Git remote token
- 同步 Git 元数据
- 刷新 DVC 临时凭证
- 执行 `dvc pull`

## 第五步：修改文件

你可以直接在工作区内修改模型相关文件或数据集文件，例如：

```bash
echo "hello" > note.txt
```

或者新增一个大文件：

```bash
python3 - <<'PY'
from pathlib import Path
Path("big.bin").write_bytes(b"a" * (6 * 1024 * 1024))
PY
```

## 第六步：把修改加入版本控制

执行：

```bash
mindreon repo add
```

说明：

- 默认超过 `5 MiB` 的文件会自动走 `dvc add`
- 小文件会正常进入 Git
- 也可以手动指定阈值：

```bash
mindreon repo add --threshold 1
```

## 第七步：提交代码

执行：

```bash
mindreon repo commit -m "update assets"
```

## 第八步：推送代码

执行：

```bash
mindreon repo push
```

这一步会做：

- 刷新 Git remote token
- 刷新 DVC 临时凭证
- 执行 `dvc push`
- 执行 `git push`

## 一次完整示例

下面是一套最常见的模型协作流程：

```bash
mindreon install
mindreon login
mindreon model connect --name "Qwen2.5-7B-Instruct" --version "main"
cd ./Qwen2.5-7B-Instruct
mindreon repo pull

echo "hello" > note.txt

mindreon repo add
mindreon repo commit -m "update note"
mindreon repo push
```

## 资源创建

如果你还没创建资源，可以先创建 model 或 dataset。

创建模型：

```bash
mindreon model create --name "my-model" --description "demo model"
mindreon model version create --name "my-model" --version "v1" --base "main"
```

创建数据集：

```bash
mindreon dataset create --name "my-dataset"
mindreon dataset version create --name "my-dataset" --version "v1" --base "main"
```

## 其他命令

查看仓库状态：

```bash
mindreon repo status
```

查看帮助：

```bash
mindreon help
mindreon model --help
mindreon dataset --help
mindreon repo --help
```

任务调度：

```bash
mindreon workload create-infer --name "infer-test" --model "my-model" --modelVersion "v1" --cpu 4 --memory "8G" --gpu 1
mindreon workload create-training --name "train-test" --dataset "my-dataset" --datasetVersion "v1" --pretrainModel "my-model" --pretrainModelVersion "v1" --cpu 4 --memory "16G" --gpu 1
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
