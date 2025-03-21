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

export const DeadCodeEliminationTransformer: NodeTransformer<t.Statement> = {
  key: "dead-code-elimination",
  displayName: "Dead Code Elimination",
  nodeTypes: ["BlockStatement", "IfStatement"],
  phases: ["post"],

  test(node): node is t.BlockStatement | t.IfStatement {
    return t.isBlockStatement(node) || t.isIfStatement(node);
  },

  transform(node, _context: TransformContext): t.Statement | null {
    if (t.isBlockStatement(node)) {
      const newBody: t.Statement[] = [];

      let changed = false;

      for (const stmt of node.body) {
        newBody.push(stmt);
        if (
          t.isReturnStatement(stmt) ||
          t.isThrowStatement(stmt) ||
          t.isContinueStatement(stmt) ||
          t.isBreakStatement(stmt)
        ) {
          if (node.body.length > newBody.length) {
            changed = true; // we are cutting off unreachable code
          }
          break;
        }
      }

      // Only return a new node if body changed
      return changed ? t.blockStatement(newBody) : node;
    }

    if (t.isIfStatement(node)) {
      if (t.isBooleanLiteral(node.test)) {
        if (node.test.value === true && node.consequent) {
          return node.consequent;
        }
        if (node.test.value === false && node.alternate) {
          return node.alternate;
        }
        // If no alternate, just remove the whole if
        return null;
      }
    }

    return node;
  },
};
