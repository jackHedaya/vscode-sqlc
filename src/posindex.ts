import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import fg from 'fast-glob';
import { matchQueryDefinition, parseConfig, resolveRelativeGlob } from './helpers';

type QueryHit = {
  uri: vscode.Uri;
  range: vscode.Range; // Range of the "-- name: ..." line
  command: string;    // e.g. :one, :many, :exec
  fromFile: string; // File that references this query
};

export class SqlcIndex implements vscode.Disposable {
  private configToFiles: Map<string, Set<string>> = new Map();
  private fileToNames: Map<string, Set<string>> = new Map();
  private nameToQueryHits: Map<string, QueryHit[]> = new Map();

  private configToWatchers: Map<string, vscode.FileSystemWatcher[]> = new Map();

  private disposables: vscode.Disposable[] = [];
  private ready = false;

  constructor(private readonly output: vscode.OutputChannel) { }

  public isReady() { return this.ready; }

  public async init() {
    this.output.appendLine("[index] Starting index build…");

    // Clear existing state
    this.configToFiles.clear();
    this.fileToNames.clear();
    this.nameToQueryHits.clear();

    const cfgs = await this.findSqlcConfigs();
    this.output.appendLine(`[index] Found ${cfgs.length} sqlc config(s).`);

    for (const cfgUri of cfgs) {
      this.output.appendLine(`[index] Indexing config ${cfgUri.fsPath}…`);
      await this.indexConfig(cfgUri.fsPath);

      this.output.appendLine(`[index] Finished indexing config ${cfgUri.fsPath}.`);
    }

    await this.watchConfigChanges();

    this.output.appendLine("[index] Finished index build.");

    this.ready = true;
  }

  public lookup(name: string): QueryHit[] | undefined {
    if (!this.ready) {
      this.output.appendLine("[index] Warning: lookup called before index was ready.");
      return undefined;
    }

    return this.nameToQueryHits.get(name);
  }

  private async watchConfig(path: string, patterns: string[]) {
    // 1. If we already have watchers for this config, dispose them
    // 2. Create new watchers for each pattern
    // 3. On change, invalidate the config

    // 1. If we already have watchers for this config, dispose them
    const existingWatchers = this.configToWatchers.get(path);
    if (existingWatchers) {
      for (const w of existingWatchers) {
        w.dispose();
      }
    }

    // 2. Create new watchers for each pattern
    const newWatchers: vscode.FileSystemWatcher[] = [];
    for (const pattern of patterns) {
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      newWatchers.push(watcher);
    }
    this.configToWatchers.set(path, newWatchers);

    // 3. On change, invalidate the config
    for (const watcher of newWatchers) {
      watcher.onDidChange(async (event) => {
        this.output.appendLine(`[index] File changed: ${event.fsPath}, invalidating config ${path}`);
        await this.invalidateFile(vscode.Uri.file(path));
        await this.indexFile(vscode.Uri.file(event.fsPath));
      });
      watcher.onDidCreate(async () => {
        this.output.appendLine(`[index] File created: ${path}, invalidating config ${path}`);
        await this.indexFile(vscode.Uri.file(path));
      });
      watcher.onDidDelete(() => {
        this.output.appendLine(`[index] File deleted: ${path}, invalidating config ${path}`); 
        this.invalidateFile(vscode.Uri.file(path));
      });
    }
  }

  private async unwatchConfig(path: string) {
    const existingWatchers = this.configToWatchers.get(path);
    if (existingWatchers) {
      for (const w of existingWatchers) {
        w.dispose();
      }
      this.configToWatchers.delete(path);
    }
  }

  public async watchConfigChanges() {
    const cfgWatcher = vscode.workspace.createFileSystemWatcher('**/sqlc.{yaml,yml}');

    cfgWatcher.onDidChange(async (uri) => {
      this.output.appendLine(`[index] Config file changed: ${uri.fsPath}`);
      await this.invalidateConfig(uri);

      await this.indexConfig(uri.fsPath);
    });

    cfgWatcher.onDidCreate(async (uri) => {
      this.output.appendLine(`[index] Config file created: ${uri.fsPath}`);
      await this.indexConfig(uri.fsPath);
    });

    cfgWatcher.onDidDelete(async (uri) => {
      this.output.appendLine(`[index] Config file deleted: ${uri.fsPath}`);
      await this.invalidateConfig(uri);
    });

    this.disposables.push(cfgWatcher);
  }

  private async findSqlcConfigs(): Promise<vscode.Uri[]> {
    const [a, b] = await Promise.all([
      vscode.workspace.findFiles('**/sqlc.yaml'),
      vscode.workspace.findFiles('**/sqlc.yml'),
      // TODO(@jackHedaya): Support JSON
    ]);
    return [...a, ...b];
  }

  private async indexConfig(path: string) {
    const { patterns } = await parseConfig(path);

    for (const pattern of patterns) {
      this.output.appendLine(`[index] Resolving pattern "${pattern}" from config ${path}…`);
      const files = await this.resolveFilesFromGlob(path, pattern);

      this.output.appendLine(`[index] From config ${path}, pattern "${pattern}" matched ${files.length} file(s).`);
      for (const fileUri of files) {
        await this.indexFile(fileUri);

        // Track which files are associated with which configs
        const configSet = this.configToFiles.get(path) ?? new Set<string>();
        configSet.add(fileUri.fsPath);
        this.configToFiles.set(path, configSet);
      }
    }

    // Watch this config for changes
    await this.watchConfig(path, patterns);
  }

  private async indexFile(uri: vscode.Uri) {
    const text = await fs.readFile(uri.fsPath, 'utf8');
    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const match = matchQueryDefinition(lines[i]);
      if (!match) {
        continue;
      }

      const { name, command: cmd } = match;

      const range = new vscode.Range(new vscode.Position(i, 0), new vscode.Position(i, lines[i].length));

      const hit: QueryHit = { uri, range, command: cmd, fromFile: uri.fsPath };

      const resultHit = this.nameToQueryHits.get(name) ?? [];
      resultHit.push(hit);
      this.nameToQueryHits.set(name, resultHit);
    }
  }

  private async invalidateConfig(cfgUri: vscode.Uri) {
    // 1. Find all files that this config references
    // 2. For each file, invalidate it
    // 3. Remove the config from configToFiles
    // 4. Unwatch the config

    // 1. Find all files that this config references
    const files = this.configToFiles.get(cfgUri.fsPath) ?? new Set<string>();
    for (const filePath of files) {
      // 2. For each file, invalidate it
      await this.invalidateFile(vscode.Uri.file(filePath));
    }

    // 3. Remove the config from configToFiles
    this.configToFiles.delete(cfgUri.fsPath);

    // 4. Unwatch the config
    await this.unwatchConfig(cfgUri.fsPath);
  }

  private async invalidateFile(file: vscode.Uri | string) {
    // 1. Resolve all the names that the file references
    // 2. For each name, remove all QueryHits that reference this file
    // 3. If a name has no more QueryHits, remove it from the index
    // 4. Remove the file from fileToNames

    const filePath = typeof file === 'string' ? file : file.fsPath;

    // 1. Resolve all the names that the file references
    const names = this.fileToNames.get(filePath) ?? new Set<string>();
    for (const name of names) {

      // 2. For each name, remove all QueryHits that reference this file
      const hits = this.nameToQueryHits.get(name);
      if (!hits) {
        continue;
      }

      const filtered = hits.filter(hit => hit.fromFile !== filePath);
      if (filtered.length === 0) {
        // 3. If a name has no more QueryHits, remove it from the index
        this.nameToQueryHits.delete(name);
      } else {
        this.nameToQueryHits.set(name, filtered);
      }
    }

    // 4. Remove the file from fileToNames
    this.fileToNames.delete(filePath);
  }

  private async resolveFilesFromGlob(basePath: string, glob: string): Promise<vscode.Uri[]> {
    const relativeGlob = resolveRelativeGlob(basePath, glob);
    const entries = await fg(relativeGlob, { onlyFiles: true, absolute: true });
    return entries.map(e => vscode.Uri.file(e));
  }

  public dispose() {
    this.disposables.forEach(d => d.dispose());
    for (const watchers of this.configToWatchers.values()) {
      for (const w of watchers) {
        w.dispose();
      }
    }
  }
}

