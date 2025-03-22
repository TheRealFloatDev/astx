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
import generate from "@babel/generator";
import { traverseFast } from "@babel/types";

// Minimum number of lines required to deduplicate
const MIN_BLOCK_SIZE = 3;

// Shared cache for block hashes
const blockHashMap = new Map<
  string,
  { fnId: t.Identifier; block: t.Statement[] }
>();

// Temporarily collect hoisted function declarations

export const ReusedBlockDeduplicationTransformer: NodeTransformer<t.Node> = {
  key: "reused-block-dedup",
  displayName: "Deduplicate Reused Statement Blocks",
  nodeTypes: ["BlockStatement"],
  phases: ["post"],

  test: () => true,

  transform(node, context): t.Node {
    if (!t.isBlockStatement(node) || node.body.length < MIN_BLOCK_SIZE)
      return node;

    const original = node.body;
    const updated: t.Statement[] = [...original];

    for (let i = 0; i <= original.length - MIN_BLOCK_SIZE; i++) {
      const slice = original.slice(i, i + MIN_BLOCK_SIZE);
      if (!isSafeBlock(slice)) continue;

      const hash = createBlockHash(slice);

      // First time seeing this block
      if (!blockHashMap.has(hash)) {
        const fnId = context.helpers.generateUid("shared_block");
        blockHashMap.set(hash, { fnId, block: slice });
        continue;
      }

      // Second+ time → replace with function call
      const { fnId, block } = blockHashMap.get(hash)!;

      // Only hoist once
      if (!context.hoistedFunctions.find((fn) => fn.id?.name === fnId.name)) {
        context.hoistedFunctions.push(
          t.functionDeclaration(
            fnId,
            [],
            t.blockStatement(block.map((s) => t.cloneNode(s, true)))
          )
        );
      }

      // Replace the block with a function call
      updated.splice(
        i,
        MIN_BLOCK_SIZE,
        t.expressionStatement(t.callExpression(fnId, []))
      );
      break; // only one dedup per block
    }

    return t.blockStatement(updated);
  },
};

function isSafeBlock(statements: t.Statement[]): boolean {
  return statements.every(
    (stmt) =>
      !t.isReturnStatement(stmt) &&
      !t.isBreakStatement(stmt) &&
      !t.isContinueStatement(stmt) &&
      !t.isThrowStatement(stmt) &&
      !hasThisOrArguments(stmt)
  );
}

function hasThisOrArguments(node: t.Node): boolean {
  let found = false;

  traverseFast(node, (n) => {
    if (t.isThisExpression(n)) found = true;
    if (t.isIdentifier(n, { name: "arguments" })) found = true;
  });

  return found;
}

function createBlockHash(statements: t.Statement[]): string {
  return statements.map((stmt) => generate(stmt).code).join("\n");
}
