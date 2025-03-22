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
import { traverseFast } from "@babel/types";

const MIN_BLOCK_SIZE = 5;
const MAX_ATTEMPTS = 10;

// This map tracks all seen reusable blocks by hash → fnId + block
const blockHashMap = new Map<
  string,
  { fnId: t.Identifier; block: t.Statement[] }
>();

const DATA_KEY = "reused-block-dedup.functions";

function structuredCloneLike<T>(node: T): T {
  return JSON.parse(JSON.stringify(node));
}

export const ReusedBlockDeduplicationTransformer: NodeTransformer<t.Node> = {
  key: "reused-block-dedup",
  displayName: "Deduplicate Reused Statement Blocks",
  nodeTypes: ["BlockStatement", "Program"],
  phases: ["main", "post"],

  test: (node, context) => {
    if (context.phase === "main" && t.isBlockStatement(node)) {
      return node.body.length >= MIN_BLOCK_SIZE;
    }

    if (context.phase === "post" && t.isProgram(node)) {
      return true;
    }

    return false;
  },

  transform(node, context: TransformContext): t.Node {
    if (!context.sharedData[DATA_KEY]) {
      context.sharedData[DATA_KEY] = [];
    }

    // Inject hoisted functions at the top of the program
    if (t.isProgram(node) && context.phase === "post") {
      if (context.sharedData[DATA_KEY]?.length) {
        node.body.unshift(...context.sharedData[DATA_KEY]);
        context.sharedData[DATA_KEY].length = 0; // Reset after injection
      }
      return node;
    }

    if (context.phase !== "main") return node;

    if (!t.isBlockStatement(node) || node.body.length < MIN_BLOCK_SIZE)
      return node;

    const original = node.body;
    const updated: t.Statement[] = [...original];

    for (
      let i = 0;
      i <= original.length - MIN_BLOCK_SIZE && i < MAX_ATTEMPTS;
      i++
    ) {
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
      const alreadyHoisted = context.sharedData[DATA_KEY]?.some(
        (fn: t.FunctionDeclaration) => fn.id?.name === entry!.fnId.name
      );

      if (!alreadyHoisted) {
        const fnDecl = t.functionDeclaration(
          entry.fnId,
          [],
          t.blockStatement(entry.block.map((s) => structuredCloneLike(s)))
        );
        context.sharedData[DATA_KEY]?.push(fnDecl);
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
  return statements.map((stmt) => hashStatement(stmt)).join(";");
}

function hashStatement(stmt: t.Statement): string {
  if (t.isExpressionStatement(stmt)) {
    return `expr:${hashExpression(stmt.expression)}`;
  }

  if (t.isVariableDeclaration(stmt)) {
    const decls = stmt.declarations
      .map((d) => {
        const id = t.isIdentifier(d.id) ? d.id.name : "pattern";
        const init = d.init ? hashExpression(d.init) : "undefined";
        return `${id}=${init}`;
      })
      .join(",");
    return `var:${stmt.kind}:${decls}`;
  }

  if (t.isIfStatement(stmt)) {
    return `if:${hashExpression(stmt.test)}`;
  }

  if (t.isReturnStatement(stmt)) {
    return `return:${stmt.argument ? hashExpression(stmt.argument) : "void"}`;
  }

  if (t.isExpression(stmt)) {
    return hashExpression(stmt);
  }

  return stmt.type; // fallback
}

function hashExpression(expr: t.Expression): string {
  if (t.isIdentifier(expr)) {
    return `id:${expr.name}`;
  }

  if (t.isLiteral(expr)) {
    return `lit:${String((expr as any).value)}`;
  }

  if (t.isCallExpression(expr)) {
    const callee = t.isIdentifier(expr.callee)
      ? expr.callee.name
      : expr.callee.type;
    const args = expr.arguments
      .map((arg) => (t.isExpression(arg) ? hashExpression(arg) : "arg"))
      .join(",");
    return `call:${callee}(${args})`;
  }

  if (t.isBinaryExpression(expr)) {
    const left = t.isExpression(expr.left)
      ? hashExpression(expr.left)
      : expr.left.type;
    const right = t.isExpression(expr.right)
      ? hashExpression(expr.right)
      : "expr";
    return `bin:${left}${expr.operator}${right}`;
  }

  if (t.isMemberExpression(expr)) {
    const obj = t.isIdentifier(expr.object)
      ? expr.object.name
      : expr.object.type;
    const prop = t.isIdentifier(expr.property)
      ? expr.property.name
      : expr.property.type;
    return `mem:${obj}.${prop}`;
  }

  return expr.type; // fallback
}
