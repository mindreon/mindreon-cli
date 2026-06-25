import process from "node:process";
import { parseArgs } from "../cli/args.js";
import { saveConfig, loadConfig } from "../cli/config.js";
import { request } from "../api/client.js";
import { getServicePrefix, resolveServiceBaseUrl } from "../utils/routes.js";

export async function runProject({ argv }) {
    const args = parseArgs(argv);
    const subCommand = args._[0] || "list";

    const config = await loadConfig();
    const token = process.env.MINDREON_AUTH_TOKEN || config.token;
    if (!token) {
        throw new Error("No active session found. Please login first using: mindreon login");
    }

    const iamBaseUrl = resolveServiceBaseUrl("iam", config);
    const iamPrefix = getServicePrefix("iam", iamBaseUrl);

    console.log("Fetching projects...");
    const response = await request(`${iamPrefix}/api/v1/users/current`, {
        method: "GET",
        baseUrl: iamBaseUrl,
    });

    const user = response?.data?.user || response?.user;
    if (!user) {
        throw new Error("Failed to fetch current user information from IAM service.");
    }

    const projects = user.projects || [];
    const currentProject = user.currentProject || {};
    const tenantName = user.tenant?.name || user.tenantName || "";

    if (subCommand === "list" || subCommand === "ls") {
        if (tenantName) {
            console.log(`Current Tenant: ${tenantName}`);
        }
        console.log("Available Projects:");
        if (projects.length === 0) {
            console.log("  (No projects found)");
        } else {
            for (const p of projects) {
                const isActive = p.id === currentProject.id;
                const marker = isActive ? "*" : " ";
                const status = isActive ? " (active)" : "         ";
                console.log(`  ${marker} ${p.name.padEnd(18)} ${status} [ID: ${p.id}]`);
            }
        }
        console.log("\nTo switch to a different project, run:\n  mindreon project use <name-or-id>");
        return;
    }

    if (subCommand === "use" || subCommand === "switch") {
        const target = args._[1];
        if (!target) {
            throw new Error("Missing target project. Usage: mindreon project use <name-or-id>");
        }

        const project = projects.find(
            (p) => p.id === target || p.name.toLowerCase() === target.toLowerCase()
        );

        if (!project) {
            throw new Error(`Project '${target}' not found. Run 'mindreon project list' to see available projects.`);
        }

        if (project.id === currentProject.id) {
            console.log(`Already on project '${project.name}'.`);
            return;
        }

        console.log(`Switching project to '${project.name}'...`);
        const switchResponse = await request(`${iamPrefix}/api/v1/users/${user.id}/default-project`, {
            method: "PUT",
            baseUrl: iamBaseUrl,
            body: {
                defaultProjectId: project.id,
            },
        });

        const tokens = switchResponse?.data?.tokens || switchResponse?.tokens;
        const newToken = tokens?.accessToken;

        if (newToken) {
            await saveConfig({ token: newToken });
            console.log(`Successfully switched to project '${project.name}' (ID: ${project.id}).`);
            console.log("New token has been saved to config.");
        } else {
            throw new Error("Failed to switch project: IAM service did not return a new token.");
        }
        return;
    }

    throw new Error(`Unknown project command: ${subCommand}. Available commands: list, ls, use, switch`);
}
