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
import traverse from "@babel/traverse";
import { NodeTransformer, TransformContext } from "./transformers";

export const AssignedArrowToFunctionTransformer: NodeTransformer<t.VariableDeclarator> =
  {
    key: "assigned-arrow-to-function",
    displayName: "Arrow to IIFE (Assignment)",
    nodeTypes: ["VariableDeclarator"],
    phases: ["pre"],

    test(node): node is t.VariableDeclarator {
      const tempNode = node as t.VariableDeclarator;

      return t.isArrowFunctionExpression(tempNode.init);
    },

    transform(node, context: TransformContext): t.Node {
      const arrow = node.init as t.ArrowFunctionExpression;

      let usesThis = false;
      let usesArgs = false;

      traverse(
        arrow.body,
        {
          ThisExpression() {
            usesThis = true;
          },
          Identifier(p) {
            if (p.node.name === "arguments") {
              usesArgs = true;
            }
          },
        },
        context.path.scope
      );

      const thisId = usesThis ? context.helpers.generateUid("this") : undefined;
      const argsId = usesArgs ? context.helpers.generateUid("args") : undefined;

      const body = t.isBlockStatement(arrow.body)
        ? arrow.body
        : t.blockStatement([t.returnStatement(arrow.body)]);

      const rewrittenBody = rewriteLexicalReferences(body, thisId, argsId);

      const captured: t.VariableDeclarator[] = [];
      if (thisId)
        captured.push(t.variableDeclarator(thisId, t.thisExpression()));
      if (argsId)
        captured.push(t.variableDeclarator(argsId, t.identifier("arguments")));

      const fnExpr = t.functionExpression(
        null,
        arrow.params,
        rewrittenBody,
        arrow.generator ?? false,
        arrow.async ?? false
      );

      const iife = t.callExpression(
        t.arrowFunctionExpression(
          [],
          t.blockStatement([
            t.variableDeclaration("const", captured),
            t.returnStatement(fnExpr),
          ])
        ),
        []
      );

      node.init = iife;
      return node;
    },
  };

function rewriteLexicalReferences(
  block: t.BlockStatement,
  thisId?: t.Identifier,
  argsId?: t.Identifier
): t.BlockStatement {
  const cloned = t.cloneNode(block, true) as t.BlockStatement;

  traverse(cloned, {
    ThisExpression(path) {
      if (thisId) path.replaceWith(t.identifier(thisId.name));
    },
    Identifier(path) {
      if (argsId && path.node.name === "arguments") {
        path.replaceWith(t.identifier(argsId.name));
      }
    },
  });

  return cloned;
}
