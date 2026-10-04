import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
export function modelLoader(overrides = {}) {
  const cache = new Map();
  function load(path) {
    path = resolve(path);
    if (Object.hasOwn(overrides, path)) return overrides[path];
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} };
    cache.set(path, module);
    const source = readFileSync(path, "utf8");
    const compiled = ts.transpileModule(source, {
      fileName: path,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const require = (name) => name.startsWith(".")
      ? load(resolve(dirname(path), name.endsWith(".ts") ? name : name + ".ts"))
      : nativeRequire(name);
    new Function("require", "module", "exports", compiled)(require, module, module.exports);
    return module.exports;
  }
  return load;
}
