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

import { encode } from "@msgpack/msgpack";
import {
  CompiledProgram,
  FORMAT_VERSION,
  MAGIC_HEADER,
  MINIMAL_AST_KEYS,
} from ".";
import { ArrowFunctionToFunctionTransformer } from "./transformers/ArrowFunctionToFunctionTransformer.js";
import { NodeTransformer, Phase } from "./transformers/transformers.js";
import * as babelParser from "@babel/parser";
import { gzipSync } from "zlib";
import { writeFileSync } from "fs";
import { ForEachToForTransformer } from "./transformers/ForEachToForLoop";
import traverse from "@babel/traverse";
import { ConstantFoldingTransformer } from "./transformers/ConstantFolding";
import { DeadCodeEliminationTransformer } from "./transformers/DeadCodeElimination";
import { PowToMultiplyTransformer } from "./transformers/PowToMultiply";
import { LogicalSimplificationTransformer } from "./transformers/LogicalSimplification";
import { HoistArrayLengthTransformer } from "./transformers/HoistArrayLength";
import { ForOfToIndexedTransformer } from "./transformers/ForOfToIndexed";

const TRANSFORMERS: NodeTransformer<any>[] = [
  ArrowFunctionToFunctionTransformer,
  ForEachToForTransformer,
  ConstantFoldingTransformer,
  DeadCodeEliminationTransformer,
  PowToMultiplyTransformer,
  LogicalSimplificationTransformer,
  HoistArrayLengthTransformer,
  ForOfToIndexedTransformer,
];

function collectDeclaredVariables(ast: any): Set<string> {
  const declared = new Set<string>();
  function walk(node: any) {
    if (!node || typeof node !== "object") return;
    if (node.type === "VariableDeclarator" && node.id?.name) {
      declared.add(node.id.name);
    }
    if (
      node.type === "FunctionDeclaration" ||
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression"
    ) {
      if (node.id?.name) declared.add(node.id.name);
      node.params?.forEach((param: any) => {
        if (param.type === "Identifier") declared.add(param.name);
      });
    }
    for (const key in node) {
      const value = node[key];
      if (Array.isArray(value)) value.forEach(walk);
      else if (typeof value === "object" && value !== null) walk(value);
    }
  }
  walk(ast);
  return declared;
}

export function compile(jsCode: string): CompiledProgram {
  const ast = babelParser.parse(jsCode, { sourceType: "module" });
  const valueDict: any[] = [];
  const expressionDict: string[] = [];
  const exprMap = new Map<string, number>();
  const bytecode: any[] = [];

  const declaredVars = collectDeclaredVariables(ast);
  const seenVars = new Map<string, number>();
  let varCounter = 0;

  // Transformers
  const phases: Phase[] = ["pre", "main", "post"];

  for (const phase of phases) {
    traverse(ast, {
      enter(path) {
        for (const transformer of TRANSFORMERS) {
          const matchesPhase = transformer.phases
            ? transformer.phases.includes(phase)
            : true;
          const matchesType =
            !transformer.nodeTypes ||
            transformer.nodeTypes.includes(path.node.type);
          const passesTest = transformer.test(path.node);

          if (matchesPhase && matchesType && passesTest) {
            console.log(
              `[ASTX-Compiler][${phase.toUpperCase()}] Applying transformer "${
                transformer.displayName
              }" (${transformer.key}) to node: ${
                path.node.start ?? "Generated Node"
              } (Type: ${path.node.type}) ${
                path.node.loc?.start.line
                  ? `at line ${path.node.loc?.start.line}`
                  : "- Not in original source"
              }`
            );

            try {
              const newNode = transformer.transform(path.node, {
                ast: ast,
                declaredVars: declaredVars,
                path: path,
                helpers: {
                  generateUid(base) {
                    const identifier = path.scope.generateUidIdentifier(base);
                    declaredVars.add(identifier.name);
                    return identifier;
                  },
                  replaceNode(from, to) {
                    traverse(ast, {
                      enter(path) {
                        if (path.node === from) {
                          path.replaceWith(to);
                        }
                      },
                    });
                  },
                  insertBefore(node) {
                    path.insertBefore(node);
                  },
                  insertAfter(node) {
                    path.insertAfter(node);
                  },
                },
                parent: path.parent,
              });

              if (newNode === null) {
                // Remove node if null
                path.remove();
                break; // Stop processing this node (it's been removed)
              } else if (newNode !== path.node) {
                // Only replace if the node changed
                path.replaceWith(newNode);
              }
            } catch (e) {
              console.warn(
                `[ASTX-Compiler][${phase.toUpperCase()}] Transformer "${
                  transformer.displayName
                }" (${transformer.key}) failed: ${e}`
              );
            }
          }
        }
      },
    });
  }

  function encode(node: any): number | undefined {
    if (!node || typeof node !== "object") return;

    // Check if type is currently unsupported
    if (node.type && !MINIMAL_AST_KEYS[node.type]) {
      console.error("Unsupported node type:", node.type);

      process.exit(1);
    }

    const type = node.type || "null";
    let typeIndex = exprMap.get(type);
    if (typeIndex === undefined) {
      typeIndex = expressionDict.length;
      exprMap.set(type, typeIndex);
      expressionDict.push(type);
    }

    const keys = MINIMAL_AST_KEYS[type] || [];
    const values: any[] = [];

    if (type === "TemplateElement") {
      let index = valueDict.findIndex(
        (v) => v && v.raw === node.value.raw && v.cooked === node.value.cooked
      );
      if (index === -1) {
        index = valueDict.length;
        valueDict.push(node.value);
      }
      values.push(index, node.tail);
      const nodeArr = [typeIndex, ...values];
      bytecode.push(nodeArr);
      return bytecode.length - 1;
    }

    for (const key of keys) {
      const value = node[key];

      if (key === "name" && type === "Identifier" && declaredVars.has(value)) {
        if (!seenVars.has(value)) {
          seenVars.set(value, varCounter++);
        }
        values.push(seenVars.get(value));
      } else if (
        key === "value" &&
        (type === "Literal" || type.endsWith("Literal"))
      ) {
        let index = valueDict.indexOf(value);
        if (index === -1) {
          index = valueDict.length;
          valueDict.push(value);
        }
        values.push(index);
      } else if (Array.isArray(value)) {
        values.push(value.map((v) => (typeof v === "object" ? encode(v) : v)));
      } else if (typeof value === "object" && value !== null) {
        values.push(encode(value));
      } else {
        values.push(value);
      }
    }

    const nodeArr = [typeIndex, ...values];
    bytecode.push(nodeArr);
    return bytecode.length - 1;
  }

  encode(ast.program); // Skip the File wrapper

  return {
    expressionDict,
    valueDict,
    bytecode,
  };
}

export function saveToFile(program: CompiledProgram, filename: string) {
  const encoded = encode([
    program.expressionDict,
    program.valueDict,
    program.bytecode,
  ]);
  const magic = MAGIC_HEADER; // custom magic header
  const version = FORMAT_VERSION; // format version
  const compressed = gzipSync(encoded);
  const full = Buffer.concat([magic, version, compressed]);
  writeFileSync(filename, full);
}
