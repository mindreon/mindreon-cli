import process from "node:process";

export function printRootHelp() {
  process.stdout.write(`
Mindreon CLI
A command-line interface for Mindreon AI platform workflows.

Usage:
  mindreon <command> [options]

Commands:
  login         Authenticate with Mindreon IAM service
  install       Install or verify git, git-lfs, and dvc[s3]
  create        Create model or dataset resources and versions
  connect       Initialize a local model or dataset workspace
  download      Create a workspace directory and pull remote content
  repo          Local Git/DVC workspace operations
  workload      Create and manage training, dev, or inference workloads
  image         Copy or push images between registries
  release       Maintainer command for CLI versioning and npm release
  help          Show this help message

Options:
  -h, --help    Show help message

Example:
  mindreon login
  mindreon login --username admin --password secret
  mindreon create --model example-model
  mindreon connect --model example-model --version v1
  mindreon download --dataset example-dataset --version main
  mindreon repo add
  mindreon repo add --threshold 5
  mindreon image copy docker.io/library/nginx:latest harbor.example.com/demo/nginx:latest
`);
}

export function printCreateHelp() {
  process.stdout.write(`
Usage: mindreon create [options]
       mindreon create version [options]

Commands:
  version                        Create a model or dataset version

Options:
  --model <name>                 Target model name
  --dataset <name>               Target dataset name
  --displayName <name>           Display name for resource creation
  --description <desc>           Description for resource creation
  --source <pageUpload|preset|taskPublish>
                                 Model source when creating a model
  --version <version>            Version name for version creation
  --base <branch>                Base branch for version creation
  -h, --help                     Show this help message

Notes:
  Exactly one of --model or --dataset must be provided.

Examples:
  mindreon create --model my-model
  mindreon create --model builtin-qwen --source preset
  mindreon create --dataset my-dataset
  mindreon create version --model my-model --version v1 --base main
  mindreon create version --dataset my-dataset --version v1 --base main
`);
}

export function printConnectHelp() {
  process.stdout.write(`
Usage: mindreon connect (--model <name> | --dataset <name>) [options]

Options:
  --model <name>                 Target model name
  --dataset <name>               Target dataset name
  --version <version>            Branch or version to initialize
  --dir <path>                   Target workspace directory
  -h, --help                     Show this help message

Notes:
  connect only initializes the local workspace. It does not pull remote files.

Examples:
  mindreon connect --model my-model --version main
  mindreon connect --dataset my-dataset --version main
  mindreon connect --model my-model --dir ./workspace/model
`);
}

export function printDownloadHelp() {
  process.stdout.write(`
Usage: mindreon download (--model <name> | --dataset <name>) [options]

Options:
  --model <name>                 Target model name
  --dataset <name>               Target dataset name
  --version <version>            Branch or version to download
  --dir <path>                   Target workspace directory
  -h, --help                     Show this help message

Notes:
  download runs the full workflow: create directory, connect workspace, and pull remote content.
  If the target path already exists, the command stops immediately.

Examples:
  mindreon download --model my-model --version main
  mindreon download --dataset my-dataset --version main
  mindreon download --model my-model --dir ./workspace/model
`);
}

export function printImageHelp() {
  process.stdout.write(`
Usage: mindreon image <src> <dst> [options]
       mindreon image copy <src> <dst> [options]
       mindreon image copy --from <src> --to <dst> [options]

Commands:
  copy                           Copy an image from src to dst

Options:
  --from <src>                   Source image reference
  --to <dst>                     Destination image reference
  --src-tls-verify <bool>        Verify source registry TLS (default: false)
  --dest-tls-verify <bool>       Verify destination registry TLS (default: false)
  --dry-run                      Print the skopeo command only, do not execute the copy
  -h, --help                     Show this help message

Examples:
  mindreon image docker.io/library/nginx:latest harbor.example.com/demo/nginx:latest
  mindreon image copy docker.io/library/nginx:latest harbor.example.com/demo/nginx:latest
  mindreon image copy --from quay.io/prometheus/prometheus:v2.54.1 --to harbor.example.com/ops/prometheus:v2.54.1
`);
}

export function printReleaseHelp() {
  process.stdout.write(`
Usage: mindreon release [patch|minor|major] [options]

Options:
  --yes                  Skip confirmation prompts
  --dry-run              Print commands without executing them
  --skip-push            Do not push tags and commits to remote
  --skip-github-release  Do not create a GitHub release
  --skip-publish         Do not publish to npm
  -h, --help             Show this help message
`);
}

export function printLoginHelp() {
  process.stdout.write(`
Usage: mindreon login [options]

Options:
  --url <url>            Mindreon base URL
  --username <name>      Login username
  --password <password>  Login password
  -h, --help             Show this help message

Examples:
  mindreon login
  mindreon login --url https://dev-4-13.mindreon.com --username orgadmin --password 'secret'
`);
}

export function printInstallHelp() {
  process.stdout.write(`
Usage: mindreon install [--check] [--skip-skopeo]

Options:
  --check                Only print dependency status, do not install
  --skip-skopeo          Do not install optional skopeo
  -h, --help             Show this help message
`);
}

export function printWorkloadHelp() {
  process.stdout.write(`
Usage: mindreon workload <command> [options]

Commands:
  create-training                Create a training workload
  create-dev                     Create a dev workload
  create-infer                   Create an inference workload
  list                           List workloads

Examples:
  mindreon workload create-training --name train-demo --dataset my-dataset --datasetVersion v1
  mindreon workload create-infer --name infer-demo --model my-model --modelVersion v1
  mindreon workload list --kind Job
`);
}
