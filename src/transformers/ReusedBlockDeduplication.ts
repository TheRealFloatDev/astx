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

const MIN_BLOCK_SIZE = 3;

// This map tracks all seen reusable blocks by hash → fnId + block
const blockHashMap = new Map<
  string,
  { fnId: t.Identifier; block: t.Statement[] }
>();

export const ReusedBlockDeduplicationTransformer: NodeTransformer<t.Node> = {
  key: "reused-block-dedup",
  displayName: "Deduplicate Reused Statement Blocks",
  nodeTypes: ["BlockStatement", "Program"],
  phases: ["main", "post"],

  test: () => true,

  transform(node, context: TransformContext): t.Node {
    if (!context.sharedData["dedupHoistedFunctions"]) {
      context.sharedData["dedupHoistedFunctions"] = [];
    }

    // Inject hoisted functions at the top of the program
    if (t.isProgram(node) && context.phase === "post") {
      console.log(
        "dedupHoistedFunctions",
        context.sharedData["dedupHoistedFunctions"]
      );

      if (context.sharedData["dedupHoistedFunctions"]?.length) {
        node.body.unshift(...context.sharedData["dedupHoistedFunctions"]);
        context.sharedData["dedupHoistedFunctions"].length = 0; // Reset after injection
      }
      return node;
    }

    if (context.phase !== "main") return node;

    if (!t.isBlockStatement(node) || node.body.length < MIN_BLOCK_SIZE)
      return node;

    const original = node.body;
    const updated: t.Statement[] = [...original];

    for (let i = 0; i <= original.length - MIN_BLOCK_SIZE; i++) {
      const slice = original.slice(i, i + MIN_BLOCK_SIZE);
      if (!isSafeBlock(slice)) continue;

      const hash = createBlockHash(slice);
      let entry = blockHashMap.get(hash);

      if (!entry) {
        const fnId = context.helpers.generateUid("shared_block");
        entry = { fnId, block: slice };
        blockHashMap.set(hash, entry);
        continue;
      }

      // Hoist function only once
      const alreadyHoisted = context.sharedData["dedupHoistedFunctions"]?.some(
        (fn: t.FunctionDeclaration) => fn.id?.name === entry!.fnId.name
      );

      if (!alreadyHoisted) {
        const fnDecl = t.functionDeclaration(
          entry.fnId,
          [],
          t.blockStatement(entry.block.map((s) => t.cloneNode(s, true)))
        );
        context.sharedData["dedupHoistedFunctions"]?.push(fnDecl);
        console.log(
          "length",
          context.sharedData["dedupHoistedFunctions"]?.length
        );
      }

      // Replace the block with a call to the shared function
      updated.splice(
        i,
        MIN_BLOCK_SIZE,
        t.expressionStatement(t.callExpression(entry.fnId, []))
      );
      break; // Limit to one dedup per block
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
