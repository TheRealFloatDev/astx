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

export const UnchainFilterToLoopTransformer: NodeTransformer<t.VariableDeclarator> =
  {
    key: "filter-unchain-to-loop",
    displayName: "Unchain .filter() to Preallocated Loops (Scoped)",
    nodeTypes: ["VariableDeclarator"],
    phases: ["main"],

    test(node) {
      return t.isVariableDeclarator(node) && isFilterCall(node.init);
    },

    transform(node, context) {
      if (!node.init || !t.isCallExpression(node.init)) return node;

      const chain: t.Expression[] = [];
      let current: t.Expression = node.init;

      // Walk chain
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

      chain.forEach((callExpr, i) => {
        if (!t.isCallExpression(callExpr)) return;
        const callee = callExpr.callee as t.MemberExpression;
        const method = callee.property;

        if (!t.isIdentifier(method)) return;

        if (
          method.name === "filter" &&
          (t.isArrowFunctionExpression(callExpr.arguments[0]) ||
            t.isFunctionExpression(callExpr.arguments[0]))
        ) {
          const fn = callExpr.arguments[0] as
            | t.ArrowFunctionExpression
            | t.FunctionExpression;

          const tmp = context.helpers.generateUid(`tmp${i + 1}`);
          const write = context.helpers.generateUid(`w${i + 1}`);
          const index = context.helpers.generateUid("i");
          const el = context.helpers.generateUid("el");

          const inputLen = t.memberExpression(prev, t.identifier("length"));

          const conditionArgs = [el];
          if (fn.params.length > 1) {
            conditionArgs.push(index);
          }

          const test = t.isBlockStatement(fn.body)
            ? t.callExpression(
                t.functionExpression(null, fn.params, fn.body),
                conditionArgs
              )
            : t.callExpression(
                t.arrowFunctionExpression(fn.params, fn.body),
                conditionArgs
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

          // let writeN = 0;
          statements.push(
            t.variableDeclaration("let", [
              t.variableDeclarator(write, t.numericLiteral(0)),
            ])
          );

          // for (...) { if (...) tmp[write++] = el; }
          statements.push(
            t.forStatement(
              t.variableDeclaration("let", [
                t.variableDeclarator(index, t.numericLiteral(0)),
              ]),
              t.binaryExpression("<", index, inputLen),
              t.updateExpression("++", index),
              t.blockStatement([
                t.variableDeclaration("const", [
                  t.variableDeclarator(
                    el,
                    t.memberExpression(prev, index, true)
                  ),
                ]),
                t.ifStatement(
                  test,
                  t.blockStatement([
                    t.expressionStatement(
                      t.assignmentExpression(
                        "=",
                        t.memberExpression(tmp, write, true),
                        el
                      )
                    ),
                    t.expressionStatement(t.updateExpression("++", write)),
                  ])
                ),
              ])
            )
          );

          prev = tmp;
          lastTemp = tmp;
        } else {
          // Not a .filter – keep it as-is
          const tmp = context.helpers.generateUid(`tmp${i + 1}`);
          const expr = t.callExpression(
            t.memberExpression(prev, method),
            callExpr.arguments as t.Expression[]
          );
          statements.push(
            t.variableDeclaration("const", [t.variableDeclarator(tmp, expr)])
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

function isFilterCall(expr?: t.Expression | null): boolean {
  return (
    !!expr &&
    t.isCallExpression(expr) &&
    t.isMemberExpression(expr.callee) &&
    t.isIdentifier(expr.callee.property, { name: "filter" }) &&
    (t.isArrowFunctionExpression(expr.arguments[0]) ||
      t.isFunctionExpression(expr.arguments[0]))
  );
}
