import fs from "node:fs/promises";

function normalizeValue(value) {
    if (value === undefined || value === null) {
        return "";
    }
    return String(value);
}

function parseValue(raw) {
    const value = raw.trim();
    if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
    ) {
        return value.slice(1, -1);
    }
    return value;
}

export async function readIni(filePath) {
    try {
        const content = await fs.readFile(filePath, "utf-8");
        const data = {};
        let currentSection = null;

        for (const rawLine of content.split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line || line.startsWith("#") || line.startsWith(";")) {
                continue;
            }

            if (line.startsWith("[") && line.endsWith("]")) {
                currentSection = line.slice(1, -1).trim();
                if (!data[currentSection]) {
                    data[currentSection] = {};
                }
                continue;
            }

            const separator = line.indexOf("=");
            if (separator === -1 || !currentSection) {
                continue;
            }

            const key = line.slice(0, separator).trim();
            const value = parseValue(line.slice(separator + 1));
            data[currentSection][key] = value;
        }

        return data;
    } catch (error) {
        if (error.code === "ENOENT") {
            return {};
        }
        throw error;
    }
}

export async function writeIni(filePath, sections) {
    const lines = [];
    for (const [sectionName, sectionValues] of Object.entries(sections)) {
        lines.push(`[${sectionName}]`);
        for (const [key, value] of Object.entries(sectionValues)) {
            lines.push(`${key} = ${normalizeValue(value)}`);
        }
        lines.push("");
    }

    await fs.writeFile(filePath, `${lines.join("\n").trimEnd()}\n`, "utf-8");
}
