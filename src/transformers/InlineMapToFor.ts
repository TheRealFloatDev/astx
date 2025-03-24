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
import { NodeTransformer } from "./transformers";

export const UnchainMapToLoopTransformer: NodeTransformer<t.VariableDeclarator> =
  {
    key: "map-unchain-to-loop",
    displayName: "Unchain .map() to Preallocated Loops (Scoped)",
    nodeTypes: ["VariableDeclarator"],
    phases: ["main"],

    test(node) {
      return t.isVariableDeclarator(node) && isMapCall(node.init);
    },

    transform(node, context) {
      if (!node.init || !t.isCallExpression(node.init)) return node;

      const chain: t.Expression[] = [];
      let current: t.Expression = node.init;

      // Walk the chain: input.map(...).filter(...).map(...) etc.
      while (
        t.isCallExpression(current) &&
        t.isMemberExpression(current.callee)
      ) {
        chain.unshift(current);
        current = current.callee.object;
      }

      const inputExpr = current;
      const statements: t.Statement[] = [];
      let prev = inputExpr;
      let lastTemp: t.Identifier | null = null;

      // Walk the call chain in order
      chain.forEach((callExpr, i) => {
        if (!t.isCallExpression(callExpr)) return;
        const callee = callExpr.callee as t.MemberExpression;
        const method = callee.property;

        if (!t.isIdentifier(method)) return;

        if (
          method.name === "map" &&
          (t.isArrowFunctionExpression(callExpr.arguments[0]) ||
            t.isFunctionExpression(callExpr.arguments[0]))
        ) {
          const fn = callExpr.arguments[0] as
            | t.ArrowFunctionExpression
            | t.FunctionExpression;
          const tmp = context.helpers.generateUid(`tmp${i + 1}`);
          const index = context.helpers.generateUid("i");

          const inputLen = t.memberExpression(prev, t.identifier("length"));
          const mapFnArgs = [t.memberExpression(prev, index, true)];

          if (fn.params.length > 1) {
            // mapFnArgs.push(index);
            mapFnArgs.push(
              t.memberExpression(t.identifier("i"), t.numericLiteral(0), true)
            );
          }

          const mapCall = t.isBlockStatement(fn.body)
            ? t.callExpression(
                t.functionExpression(null, fn.params, fn.body),
                mapFnArgs
              )
            : t.callExpression(
                t.arrowFunctionExpression(fn.params, fn.body),
                mapFnArgs
              );

          // const tmpN = new Array(prev.length);
          statements.push(
            t.variableDeclaration("const", [
              t.variableDeclarator(
                tmp,
                t.newExpression(t.identifier("Array"), [inputLen])
              ),
            ])
          );

          // for (let i = 0; i < prev.length; i++) { tmp[i] = ... }
          statements.push(
            t.forStatement(
              t.variableDeclaration("let", [
                t.variableDeclarator(index, t.numericLiteral(0)),
              ]),
              t.binaryExpression("<", index, inputLen),
              t.updateExpression("++", index),
              t.blockStatement([
                t.expressionStatement(
                  t.assignmentExpression(
                    "=",
                    t.memberExpression(tmp, index, true),
                    mapCall
                  )
                ),
              ])
            )
          );

          prev = tmp;
          lastTemp = tmp;
        } else {
          // Not a .map() – apply directly and assign to new const
          const tmp = context.helpers.generateUid(`tmp${i + 1}`);
          const replaced = t.callExpression(
            t.memberExpression(prev, method),
            callExpr.arguments as t.Expression[]
          );

          statements.push(
            t.variableDeclaration("const", [
              t.variableDeclarator(tmp, replaced),
            ])
          );

          prev = tmp;
          lastTemp = tmp;
        }
      });

      // Assign final result = lastTemp;
      statements.push(
        t.expressionStatement(
          t.assignmentExpression("=", node.id as t.LVal, lastTemp!)
        )
      );

      const resultLet = t.variableDeclaration("let", [
        t.variableDeclarator(node.id),
      ]);

      const block = t.blockStatement(statements);

      context.helpers.replaceNode(context.parent!, [resultLet, block]);

      return null;
    },
  };

function isMapCall(expr?: t.Expression | null): boolean {
  return (
    !!expr &&
    t.isCallExpression(expr) &&
    t.isMemberExpression(expr.callee) &&
    t.isIdentifier(expr.callee.property, { name: "map" }) &&
    (t.isArrowFunctionExpression(expr.arguments[0]) ||
      t.isFunctionExpression(expr.arguments[0]))
  );
}
