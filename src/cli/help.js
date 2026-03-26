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
  dataset       Dataset and dataset version management
  model         Model and model version management
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
  mindreon model connect --name example-model --version v1
  mindreon repo add
  mindreon repo add --threshold 5
  mindreon image copy docker.io/library/nginx:latest harbor.example.com/demo/nginx:latest
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

export function printDatasetHelp() {
  process.stdout.write(`
Usage: mindreon dataset <command> [options]

Commands:
  create                         Create a dataset
  version create                 Create a dataset version
  connect                        Initialize a local dataset workspace

Examples:
  mindreon dataset create --name my-dataset
  mindreon dataset version create --name my-dataset --version v1 --base main
  mindreon dataset connect --name my-dataset --version main
`);
}

export function printModelHelp() {
  process.stdout.write(`
Usage: mindreon model <command> [options]

Commands:
  create                         Create a model
  version create                 Create a model version
  connect                        Initialize a local model workspace

Examples:
  mindreon model create --name my-model
  mindreon model version create --name my-model --version v1 --base main
  mindreon model connect --name my-model --version main
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
