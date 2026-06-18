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
  file          Upload files to the platform file center workspace
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
  --preset                       Create a platform preset resource
  --source <custom|preset|taskPublish>
                                 Resource source. Defaults to custom. taskPublish is model-only.
  --version <version>            Version name for version creation
  --base <branch>                Base branch for version creation
  -h, --help                     Show this help message

Notes:
  Exactly one of --model or --dataset must be provided.

Examples:
  mindreon create --model my-model
  mindreon create --model builtin-qwen --preset
  mindreon create --dataset my-dataset
  mindreon create --dataset coco8 --preset
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
  If the target path is an existing Mindreon workspace, the command reuses it and continues pulling remote content.
  If the target path is a non-empty directory but not a Mindreon workspace, the command stops immediately.

Examples:
  mindreon download --model my-model --version main
  mindreon download --dataset my-dataset --version main
  mindreon download --model my-model --dir ./workspace/model
`);
}

export function printFileHelp() {
  process.stdout.write(`
Usage: mindreon file upload <file_path> [options]

Commands:
  upload                         Upload a file to the personal or project workspace via TUS

Options:
  --scope <personal|project>     Target workspace scope (default: personal)
  --remote-path <path>           Destination path within the workspace (default: /<filename>)
  -h, --help                     Show this help message

Output:
  Prints the download URL that can be used as --file-url or --dockerfile-url
  in 'mindreon image build'. The URL requires authentication (handled automatically
  by the image build worker via its download headers).

Examples:
  mindreon file upload ./Dockerfile
  mindreon file upload ./model.tar --remote-path /builds/model.tar
  mindreon file upload ./postgres-17.tar --scope personal --remote-path /builds/postgres-17.tar
`);
}

export function printImageHelp() {
  process.stdout.write(`
Usage: mindreon image <src> <dst> [options]
       mindreon image copy <src> <dst> [options]
       mindreon image copy --from <src> --to <dst> [options]
       mindreon image exists --repo <repo> --tag <tag>
       mindreon image build --repo <repo> --tag <tag> --method <method> [options]

Commands:
  copy                           Copy an image from src to dst using skopeo
  exists                         Check whether an image tag already exists in the platform image center
  build                          Create a build task on the Mindreon image service

copy options:
  --from <src>                   Source image reference
  --to <dst>                     Destination image reference
  --src-tls-verify <bool>        Verify source registry TLS (default: false)
  --dest-tls-verify <bool>       Verify destination registry TLS (default: false)
  --dry-run                      Print the skopeo command only, do not execute the copy

build options:
  --repo <name>                  Target repository name (short name, no project prefix) [required]
  --tag <tag>                    Target image tag [required]
  --method <method>              Build method: dockerfile | upload | registry_pull [required]
  --visibility <private|public>  Image visibility (default: platform default)
  --remarks <text>               Remarks or notes for this build
  --tag-slugs <slug1,slug2>      Comma-separated Tag Engine slugs to register after build

  dockerfile method:
    --dockerfile-url <url|path>  Dockerfile URL or local file path to use for the build

  upload method:
    --file-url <url|path>        Uploaded image tar URL or local file path [required]

  registry_pull method:
    --source-image <image>       Source image reference to pull [required]
    --source-username <user>     Source registry username
    --source-password <password> Source registry password

exists options:
  --repo <name>                  Target repository name (short name, no project prefix) [required]
  --tag <tag>                    Target image tag [required]

  -h, --help                     Show this help message

Examples:
  mindreon image docker.io/library/nginx:latest harbor.example.com/demo/nginx:latest
  mindreon image copy docker.io/library/nginx:latest harbor.example.com/demo/nginx:latest
  mindreon image copy --from quay.io/prometheus/prometheus:v2.54.1 --to harbor.example.com/ops/prometheus:v2.54.1
  mindreon image exists --repo ultralytics --tag tensorboard-8.4.60
  mindreon image build --repo myapp --tag v1.0.0 --method dockerfile --dockerfile-url ./Dockerfile
  mindreon image build --repo myapp --tag v1.0.0 --method upload --file-url ./image.tar
  mindreon image build --repo myapp --tag v1.0.0 --method registry_pull --source-image docker.io/library/nginx:latest
  mindreon image build --repo myapp --tag v1.0.0 --method registry_pull --source-image registry.example.com/ns/app:v1 --source-username user --source-password secret
`);
}

export function printReleaseHelp() {
  process.stdout.write(`
Usage: mindreon release [patch|minor|major] [options]

Notes:
  This command is for GitHub-based release flow. It only pushes release commits/tags to the GitHub push URL of origin.

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

Notes:
  macOS uses brew, Linux uses apt-get/dnf/yum, Windows uses winget.
  If automatic install fails, the command prints manual install commands.
  DVC pip install output is streamed live.
  If dvc is installed by pip but not on PATH, Mindreon falls back to python -m dvc.
`);
}
