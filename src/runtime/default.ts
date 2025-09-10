/*
 *   Copyright (c) 2025 Alexander Neitzel

 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.

 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU General Public License for more details.

 *   You should have received a copy of the GNU General Public License
 *   along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import path from "path";
import { CompiledProgram } from "..";
import { generateJSCode } from "../loader";

type RunMode = "eval" | "scoped" | "vm";

interface RunOptions {
  mode?: RunMode;
  inject?: Record<string, any>;
  skipDefaultInjects?: boolean;
}

/**
 * Runs a compiled program.
 * @param compiled The compiled program
 * @param options The run options
 * @returns The result of the program (a Promise in VM mode)
 */
export function run(compiled: CompiledProgram, options: RunOptions = {}) {
  const code = generateJSCode(compiled);
  const mode: RunMode = options.mode ?? "eval";
  const inject = options.inject ?? {};

  let context: Record<string, any> = {};
  if (!options.skipDefaultInjects) {
    const defaultInjects = {
      require: typeof require !== "undefined" ? require : undefined,
      import: (path: string) => import(path), // dynamic import for ESM
      process: process,
      console: console,
    };

    context = { ...defaultInjects };
  }

  context = { ...context, ...inject };

  if (mode !== "vm" && !context.require) {
    console.warn(
      "[ASTX Runtime] Warning: 'require' seems not to be available in the current environment."
    );
  }

  if (mode === "eval") {
    // ✅ Simple eval, runs in current scope
    Object.assign(globalThis, context); // inject into global if needed
    return eval(code);
  }

  if (mode === "scoped") {
    // ✅ Use Function constructor with manual injection
    const argNames = Object.keys(context);
    const argValues = Object.values(context);
    const fn = new Function(...argNames, code);
    return fn(...argValues);
  }

  if (mode === "vm") {
    // ✅ Node.js only sandbox
    if (
      typeof process === "undefined" ||
      typeof process.versions?.node === "undefined"
    ) {
      throw new Error("VM mode is only supported in Node.js environments.");
    }

    const directory = inject.__dirname ?? process.cwd();
    const scopedRequire = (modulePath: string) => {
      if (path.isAbsolute(modulePath) || !modulePath.startsWith(".")) {
        return require(modulePath); // absolute path or bare module
      }

      const resolved = path.resolve(directory, modulePath); // relative
      return require(resolved);
    };

    return (async () => {
      const { default: vm } = await import("vm"); // 👈 dynamic import
      const vmContext = vm.createContext({
        __dirname: directory,
        __filename: path.join(directory, "index.js"), // default filename
        ...context,
        require: scopedRequire,
      });
      const script = new vm.Script(code);
      return script.runInContext(vmContext);
    })();
  }

  throw new Error(`Unknown run mode: ${mode}`);
}
