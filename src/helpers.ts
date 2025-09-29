import path from "path";
import * as v from "valibot";
import * as fs from 'fs/promises';
import * as YAML from 'yaml';

export function resolveRelativeGlob(basePath: string, glob: string): string {
    // Special case: "." means all files in the directory
    if (glob === ".") {
        glob = "*";
    }

    const configDir = path.dirname(basePath);
    return path.join(configDir, glob);
}

export function matchQueryDefinition(line: string): { name: string; command: string; } | null {
    const lineRegex = /^\s*--\s+name:\s*([A-Za-z0-9_]+)\s+(:[A-Za-z0-9]+)\b/;
    const match = lineRegex.exec(line);
    if (match) {
        return { name: match[1], command: match[2] };
    }
    return null;
}

export async function parseConfig(path: string): Promise<{ patterns: string[]; }> {
    const text = await fs.readFile(path, 'utf8');

    const cfg = YAML.parse(text);
    if (!cfg) {
        throw new Error('Failed to parse YAML');
    }

    const parsed = v.safeParse(ConfigSchema, cfg);
    if (!parsed.success) {
        throw new Error('Invalid sqlc config: ' + parsed.issues.map(i => i.message).join('; '));
    }

    const config = parsed.output;
    const patterns: Set<string> = new Set();

    for (const sqlCfg of config.sql) {
        const p = getQueryPaths(sqlCfg.queries);
        if (!p) {
            continue;
        }

        for (const pattern of p) {
            patterns.add(pattern);
        }
    }

    return { patterns: Array.from(patterns) };
}

const ConfigSchema = v.object({
  sql: v.array(v.object({
    queries: v.union([v.string(), v.array(v.string())]),
    gen: v.object({
      go: v.object({
        package: v.string(),
        out: v.string()
      })
    }),
  }))
});


function getQueryPaths(strOrArr: string | string[]): string[] | null {
    if (typeof strOrArr === 'string') {
        return [strOrArr];
    } else if (Array.isArray(strOrArr)) {
        return strOrArr;
    }

    return null;
}