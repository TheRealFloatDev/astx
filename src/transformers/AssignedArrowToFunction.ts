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

export const AssignedArrowToFunctionTransformer: NodeTransformer<t.VariableDeclaration> =
  {
    key: "assigned-arrow-to-function",
    displayName: "Arrow to Function (Assigned)",
    nodeTypes: ["VariableDeclaration"],
    phases: ["pre"],

    test(node): node is t.VariableDeclaration {
      if (!t.isVariableDeclaration(node)) return false;
      return node.declarations.some((decl) =>
        t.isArrowFunctionExpression(decl.init)
      );
    },

    transform(node, context: TransformContext): t.Node[] | null {
      const preHoisted: t.VariableDeclaration[] = [];
      const newDeclarations: t.VariableDeclarator[] = [];

      for (const decl of node.declarations) {
        const init = decl.init;

        if (!t.isArrowFunctionExpression(init)) {
          newDeclarations.push(decl);
          continue;
        }

        let usesThis = false;
        let usesArgs = false;

        traverseFast(init.body, (n: t.Node) => {
          if (t.isThisExpression(n)) usesThis = true;
          if (t.isIdentifier(n, { name: "arguments" })) usesArgs = true;
        });

        const thisId = usesThis
          ? context.helpers.generateUid("this")
          : undefined;
        const argsId = usesArgs
          ? context.helpers.generateUid("args")
          : undefined;

        const originalBody = t.isBlockStatement(init.body)
          ? init.body
          : t.blockStatement([t.returnStatement(init.body)]);

        const rewrittenBody = rewriteLexicalReferences(
          originalBody,
          thisId,
          argsId
        );

        const fnExpr = t.functionExpression(
          null,
          init.params,
          rewrittenBody,
          init.generator ?? false,
          init.async ?? false
        );

        if (thisId) {
          preHoisted.push(
            t.variableDeclaration("const", [
              t.variableDeclarator(thisId, t.thisExpression()),
            ])
          );
        }

        if (argsId) {
          preHoisted.push(
            t.variableDeclaration("const", [
              t.variableDeclarator(argsId, t.identifier("arguments")),
            ])
          );
        }

        newDeclarations.push({
          ...decl,
          init: fnExpr,
        });
      }

      return [...preHoisted, t.variableDeclaration(node.kind, newDeclarations)];
    },
  };

function rewriteLexicalReferences(
  block: t.BlockStatement,
  thisId?: t.Identifier,
  argsId?: t.Identifier
): t.BlockStatement {
  const cloned = t.cloneNode(block, true) as t.BlockStatement;

  traverseFast(cloned, (node: t.Node) => {
    if (thisId && t.isThisExpression(node)) {
      Object.assign(node, t.identifier(thisId.name));
    }
    if (argsId && t.isIdentifier(node, { name: "arguments" })) {
      Object.assign(node, t.identifier(argsId.name));
    }
  });

  return cloned;
}
