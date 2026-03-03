import process from "node:process";

export function printRootHelp() {
    process.stdout.write(`
Mindreon MCP CLI
A command-line interface for Mindreon AI platform workflows.

Usage:
  mindreon-mcp <command> [options]

Commands:
  login         Authenticate with Mindreon IAM service
  file          File uploading and management (TUS protocol)
  dataset       Dataset and dataset version management
  model         Model and model version management
  workload      Create and manage training, dev, or inference workloads
  help          Show this help message

Options:
  -h, --help    Show help message

Example:
  mindreon-mcp login --username admin --password secret
  mindreon-mcp dataset create --name example
`);
}
