# Mindreon CLI 离线发布 TODO

## 目标

在保留 npm 发布的同时，新增面向离线用户的二进制和离线安装包交付方式。

## 目标形态

- npm 继续发布 `@mindreon/mindreon-cli`
  - 面向已有 Node.js 环境的用户
  - 安装方式保持为 `npm i -g @mindreon/mindreon-cli`
- GitHub Release 或内网下载站发布单文件二进制
  - `mindreon-linux-x64`
  - `mindreon-linux-arm64`
  - `mindreon-macos-arm64`
  - `mindreon-macos-x64`
  - `mindreon-windows-x64.exe`
- 企业离线包提供完整依赖安装能力
  - CLI 二进制
  - Git / Git LFS / Python / pip / DVC 相关离线依赖
  - 可选 `skopeo`
  - `install.sh`
  - `manifest.json`
  - `sha256sum.txt`

## 边界说明

单文件二进制只解决 `mindreon` CLI 自身运行问题，不自动解决系统级依赖。

完整功能仍依赖：

- `git`
- `git-lfs`
- `python3`
- `python3-pip`
- `dvc[s3]`
- `skopeo`，可选，用于镜像转推

因此交付分两层：

- 只要 CLI 能启动、登录、调用 API：二进制即可。
- 要求 `download`、`repo pull/push`、DVC 数据操作也可用：需要 offline bundle。

## 推荐阶段

### 阶段一：双轨发布

- [ ] 保留现有 npm 发布流程。
- [ ] 选择 Node CLI 二进制打包方案。
- [ ] 新增二进制构建脚本，例如 `npm run build:binary`。
- [ ] 产出 Linux / macOS / Windows 多平台二进制。
- [ ] 在 GitHub Release 或内网下载站上传二进制产物。

候选方案：

- `pkg`
- `nexe`
- `bun build --compile`
- Node SEA

初始建议：优先验证 `pkg` 或 `bun build --compile`，以最小改动产出可运行二进制。

### 阶段二：doctor 诊断

- [ ] 新增 `mindreon doctor` 命令。
- [ ] 检查 `git`、`git-lfs`、`python3`、`python3-pip`、`dvc`、`skopeo`。
- [ ] 对缺失依赖给出明确安装建议。
- [ ] 必需依赖缺失时返回非 0 状态码。

建议输出示例：

```text
OK       git
OK       git-lfs
MISSING  python3
MISSING  dvc
OPTIONAL skopeo
```

### 阶段三：离线安装包

- [ ] 新增离线包构建脚本，例如 `npm run offline:bundle`。
- [ ] 离线包中包含当前平台 CLI 二进制。
- [ ] 离线包中包含 `dvc[s3]` 的 Python wheels。
- [ ] 离线包中包含目标系统的 `.deb` 或 `.rpm` 依赖包。
- [ ] 生成 `manifest.json`。
- [ ] 生成 `sha256sum.txt`。
- [ ] 提供 `install.sh`，完成复制二进制、安装依赖、执行校验。
- [ ] 支持 `mindreon install --offline <bundle-dir>`。

推荐目录结构：

```text
mindreon-cli-offline-linux-x64-v0.1.20/
  bin/
    mindreon-linux-x64
  wheels/
    *.whl
  packages/
    deb/
      *.deb
    rpm/
      *.rpm
  install.sh
  manifest.json
  sha256sum.txt
  README.md
```

## 命令设计

```bash
mindreon doctor
mindreon install --check
mindreon install --offline ./mindreon-cli-offline-linux-x64-v0.1.20
```

维护者命令：

```bash
npm run build:binary
npm run offline:bundle
```

## CI TODO

- [ ] npm publish job 保持不变。
- [ ] 新增 binary release job。
- [ ] tag 推送时构建多平台二进制。
- [ ] 上传二进制到 GitHub Release。
- [ ] 可选：上传 offline bundle 到 GitHub Release 或内网制品库。
- [ ] Release artifact 生成 sha256 校验文件。

## 未决问题

- [ ] 最终选择哪种二进制打包工具。
- [ ] 是否需要 Windows 离线依赖安装包。
- [ ] `.deb` / `.rpm` 是否由 CI 自动下载，还是由发布者手动补齐。
- [ ] 离线包是否按发行版区分，例如 Ubuntu 22.04 / Ubuntu 24.04 / Rocky 9。
- [ ] 是否需要内网包仓库方案替代直接分发 `.deb` / `.rpm`。
