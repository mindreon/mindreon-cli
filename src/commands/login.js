import { parseArgs } from "../cli/args.js";
import { saveConfig, loadConfig } from "../cli/config.js";
import { request } from "../api/client.js";

export async function runLogin({ argv }) {
    const args = parseArgs(argv);

    const username = args.username || args.u;
    const password = args.password || args.p;
    // IAM API URL or custom setup
    let url = args.url;

    if (!username || !password) {
        throw new Error(
            "Missing required arguments. Usage: mindreon-mcp login --username <user> --password <pass>"
        );
    }

    // Save custom URL if provided, so subsequent commands use it
    if (url) {
        console.log(`Setting API URL to: ${url}`);
        await saveConfig({ url });
        // Update env for current process so request uses it
        process.env.MINDREON_API_URL = url;
    } else {
        const config = await loadConfig();
        if (config.url) {
            process.env.MINDREON_API_URL = config.url;
        }
    }

    console.log(`Logging in as ${username}...`);

    const response = await request("/iam-service/api/v1/auth/login", {
        method: "POST",
        skipAuth: true,
        body: {
            username,
            password,
        },
    });

    if (response && response.data && response.data.accessToken) {
        const token = response.data.accessToken;
        await saveConfig({ token, username });
        console.log(`Successfully logged in as ${username}. Token saved to config.`);
    } else {
        throw new Error("Invalid response format from login API");
    }
}
