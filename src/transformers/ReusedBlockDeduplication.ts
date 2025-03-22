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

import * as t from "@babel/types";
import { NodeTransformer, TransformContext } from "./transformers";
import traverse from "@babel/traverse";

const BLOCK_SIZE = 5;
const HASH_KEY = "dedupBlock.hashes";
const FN_KEY = "dedupBlock.functions";

export const DeduplicateBlocksTransformer: NodeTransformer<t.Program> = {
  key: "reused-block-dedup",
  displayName: "Deduplicate Reused Statement Blocks",
  nodeTypes: ["Program"],
  phases: ["post"],

  test: () => true,

  transform(node, context) {
    // Init shared data
    const blockHashes: Map<
      string,
      { fnId: t.Identifier; block: t.Statement[]; count: number }
    > = (context.sharedData[HASH_KEY] ??= new Map());
    const hoisted: t.FunctionDeclaration[] = [];

    // First pass: collect all repeated blocks
    traverse(node, {
      BlockStatement(path) {
        const stmts = path.node.body;
        for (let i = 0; i <= stmts.length - BLOCK_SIZE; i++) {
          const slice = stmts.slice(i, i + BLOCK_SIZE);
          if (!isSafe(slice)) continue;

          const hash = hashBlock(slice);
          let entry = blockHashes.get(hash);

          if (!entry) {
            const fnId = context.helpers.generateUid("dedup_block");
            entry = { fnId, block: slice.map((s) => t.cloneNode(s)), count: 0 };
            blockHashes.set(hash, entry);
          }

          entry.count++;
        }
      },
    });

    // Second pass: replace and hoist
    traverse(node, {
      BlockStatement(path) {
        const stmts = path.node.body;
        for (let i = 0; i <= stmts.length - BLOCK_SIZE; i++) {
          const slice = stmts.slice(i, i + BLOCK_SIZE);
          const hash = hashBlock(slice);
          const entry = blockHashes.get(hash);
          if (!entry || entry.count < 2) continue;

          // Hoist if not yet hoisted
          if (!hoisted.find((fn) => fn.id?.name === entry!.fnId.name)) {
            hoisted.push(
              t.functionDeclaration(
                entry.fnId,
                [],
                t.blockStatement(entry.block)
              )
            );
          }

          // Replace block with call
          slice.splice(
            0,
            BLOCK_SIZE,
            t.expressionStatement(t.callExpression(entry.fnId, []))
          );

          path.node.body.splice(i, BLOCK_SIZE, slice[0]);
          i += BLOCK_SIZE - 1; // Skip over replaced block
        }
      },
    });

    // Inject hoisted functions at the top
    node.body.unshift(...hoisted);
    return node;
  },
};

// Helpers

function hashBlock(stmts: t.Statement[]): string {
  return stmts.map((s) => s.type + "-" + hashShallow(s)).join(";");
}

function hashShallow(node: t.Node): string {
  if (t.isExpressionStatement(node) && t.isCallExpression(node.expression)) {
    const callee = node.expression.callee;
    return `call:${t.isIdentifier(callee) ? callee.name : "?"}`;
  }
  if (t.isVariableDeclaration(node)) {
    return node.declarations
      .map((d) =>
        t.isIdentifier(d.id) ? `${d.id.name}:${d.init?.type ?? "?"}` : "?"
      )
      .join(",");
  }
  return node.type;
}

function isSafe(stmts: t.Statement[]): boolean {
  return stmts.every(
    (stmt) =>
      !t.isReturnStatement(stmt) &&
      !t.isThrowStatement(stmt) &&
      !t.isBreakStatement(stmt) &&
      !t.isContinueStatement(stmt)
  );
}
