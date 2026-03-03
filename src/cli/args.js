export function extractCommand(argv) {
    if (argv.length === 0) {
        return { command: null, argv: [] };
    }
    const [command, ...rest] = argv;
    return { command, argv: rest };
}

export function hasHelpFlag(argv) {
    return argv.includes("-h") || argv.includes("--help");
}

export function parseArgs(argv) {
    const args = { _: [] };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg.startsWith("--")) {
            const key = arg.slice(2);
            if (key.includes("=")) {
                const [k, v] = key.split("=");
                args[k] = v;
            } else if (i + 1 < argv.length && !argv[i + 1].startsWith("-")) {
                args[key] = argv[++i];
            } else {
                args[key] = true;
            }
        } else if (arg.startsWith("-")) {
            args[arg.slice(1)] = true;
        } else {
            args._.push(arg);
        }
    }
    return args;
}
