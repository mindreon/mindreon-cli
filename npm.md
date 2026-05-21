# npm 发布

## 发布前检查

```bash
cd /path/to/mindreon-cli
git status --short
npm whoami
node -p "require('./package.json').version"
```

## GitHub Actions 发布

首次切换到 `@mindreon/mindreon-cli` 后，建议先手动发布一次新包：

```bash
cd /path/to/mindreon-cli
npm publish --access public
```

发布成功后，到 npm 包页面配置 Trusted Publisher：

- Package: `@mindreon/mindreon-cli`
- Repository owner/name: `mindreon/mindreon-cli`
- Workflow file: `publish-npm.yml`
- Environment: `npm-publish`

配置后，推送 `v*` tag 会由 `.github/workflows/publish-npm.yml` 自动发布到 npm，不需要在 GitHub Secrets 里保存长期 npm token。

```bash
cd /path/to/mindreon-cli
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

## 本地手动发布

```bash
cd /path/to/mindreon-cli
npm run pack
npm publish --access public
```

## 自动发版并发布

```bash
cd /path/to/mindreon-cli
mindreon release patch
mindreon release minor
mindreon release major
```

说明：

- 上面这组命令是本地发布路径，会继续执行 `gh release create` 和 `npm publish`
- 如果想只打 tag 交给 GitHub Actions 发布，请加 `--skip-github-release --skip-publish`

## 版本含义

- `patch`：小修复，不改现有用法，例如 `0.1.0 -> 0.1.1`
- `minor`：新增功能但兼容旧用法，例如 `0.1.0 -> 0.2.0`
- `major`：不兼容变更，例如删命令或改参数语义
