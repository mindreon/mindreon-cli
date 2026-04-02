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
npm i -g @sanmu2018/mindreon-cli
mindreon --help
```

从源码本地安装：

```bash
cd /path/to/mindreon-cli
npm link
mindreon --help
```

安装后统一使用 `mindreon` 命令。

## Docker 使用

如果你不想在宿主机从零安装依赖，可以直接构建和推送基础镜像：

```bash
cd /path/to/mindreon-cli
make image-build-local
make image-run-help
```

如果要构建并推送当前机器架构的单架构镜像：

```bash
make image-build-push IMAGE_NAME=harbor.mindreon.com/mindreon/mindreon-cli IMAGE_TAG=v0.1.0
```

如果要同时构建 `amd64` 和 `arm64` 多架构镜像并推送：

```bash
make image-buildx-push IMAGE_NAME=mindreon/mindreon-cli IMAGE_TAG=latest
```

如果只想在本地测试多架构构建流程，也可以执行：

```bash
make image-buildx IMAGE_NAME=mindreon/mindreon-cli IMAGE_TAG=dev
```

容器里已经预装：

- `mindreon`
- `git`
- `git-lfs`
- `python3`
- `dvc[s3]`

说明：

- 这个镜像本身不强制挂载任何宿主机目录
- 镜像只提供可直接使用的运行环境
- 是否挂载工作目录、配置目录、SSH 目录，由最终用户自行决定

例如，用户如果想把当前目录挂进容器并进入 shell，可以自己执行：

```bash
docker run -it \
  -v "$PWD":/workspace \
  -w /workspace \
  harbor.mindreon.com/mindreon/mindreon-cli:v0.1.0 \
  bash
```

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
- `skopeo`（可选，用于镜像转推）

如果你不想安装 `skopeo`，可以跳过：

```bash
mindreon install --skip-skopeo
```

镜像转推示例：

```bash
mindreon image docker.io/library/nginx:latest harbor.example.com/demo/nginx:latest
```

也支持显式写法：

```bash
mindreon image copy --from docker.io/library/nginx:latest --to harbor.example.com/demo/nginx:latest
```

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

- 拉取仓库代码，模型或者数据集文件

## 第五步：修改文件

你可以直接在工作区内修改模型相关文件或数据集文件，例如：

```bash
echo "hello" > note.txt
```

## 关于 DVC

Mindreon CLI 里，`git` 和 `dvc` 分工不同：

- 小文件默认继续由 `git` 管理
- 大文件默认由 `dvc` 管理

默认规则是：

- 超过 `5 MiB` 的文件，会在 `mindreon repo add` 时自动执行 `dvc add`
- 这类文件不会直接进入 Git，而是由 DVC 管理真实内容

请特别注意：

- 不要删除任何带 `.dvc` 后缀的文件
- 这些 `.dvc` 文件是 DVC 对大文件的跟踪标识
- 它们本身需要提交到 Git
- 真正的大文件内容由 DVC 和对象存储管理

这样做的原因是：

- 大文件不适合直接放进 Git
- Git 负责管理代码和元数据
- DVC 负责管理大文件版本和远端存储

## 第六步：把修改加入版本控制

执行：

```bash
mindreon repo add
```

说明：

- 默认超过 `5 MiB` 的文件会自动走 `dvc add`
- 如果本次待跟踪文件总数超过 `2000`，会优先对最顶层的未追踪目录执行 `dvc add`
- 小文件会正常进入 Git
- 如果看到新生成的 `.dvc` 文件，请一并提交，不要删除
- 也可以手动指定阈值：

```bash
mindreon repo add --threshold 1
mindreon repo add --count-threshold 5000
mindreon repo add --threshold 1 --count-threshold 5000
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
mindreon model create --name "builtin-qwen" --description "preset model" --source "preset"
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
