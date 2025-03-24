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

export const FusionLoopTransformer: NodeTransformer<t.VariableDeclarator> = {
  key: "fusion-loop",
  displayName: "Fusion of .map()/.filter()/.reduce() into Single Loop",
  nodeTypes: ["VariableDeclarator"],
  phases: ["pre"],

  test(node) {
    return (
      t.isVariableDeclarator(node) &&
      isFusableChain((node as t.VariableDeclarator).init!)
    );
  },

  transform(node, context) {
    if (!node.init || !t.isCallExpression(node.init)) return node;

    const steps: t.CallExpression[] = [];
    let current: t.Expression = node.init;

    while (
      t.isCallExpression(current) &&
      t.isMemberExpression(current.callee)
    ) {
      steps.unshift(current);
      current = current.callee.object;
    }

    const input = current;
    const x = context.helpers.generateUid("x");
    const i = context.helpers.generateUid("i");
    const resultId = node.id as t.Identifier;

    const body: t.Statement[] = [];
    const hoisted: t.VariableDeclaration[] = [];
    let finalExpr: t.Expression = resultId;

    let reduce: t.CallExpression | null = null;
    let reduceFnId: t.Identifier | null = null;
    let reduceInit: t.Expression | null = null;

    const transforms: t.Statement[] = [];
    let currentVal = t.identifier(x.name);

    for (let idx = 0; idx < steps.length; idx++) {
      const call = steps[idx];
      if (!t.isMemberExpression(call.callee)) continue;
      const prop = call.callee.property;
      if (!t.isIdentifier(prop)) continue;

      const argFn = call.arguments[0];
      const method = prop.name;

      if ((method === "map" || method === "filter") && isFn(argFn)) {
        const fnId = context.helpers.generateUid(`${method}Fn`);
        hoisted.push(
          t.variableDeclaration("const", [
            t.variableDeclarator(fnId, argFn as any),
          ])
        );

        if (method === "map") {
          const mappedVal = t.callExpression(fnId, [currentVal]);
          currentVal = context.helpers.generateUid("mapped");
          transforms.push(
            t.variableDeclaration("const", [
              t.variableDeclarator(currentVal, mappedVal),
            ])
          );
        } else if (method === "filter") {
          transforms.push(
            t.ifStatement(
              t.unaryExpression("!", t.callExpression(fnId, [currentVal])),
              t.continueStatement()
            )
          );
        }
      } else if (method === "reduce" && isFn(argFn)) {
        reduce = call;
        reduceFnId = context.helpers.generateUid("reducerFn");
        reduceInit = call.arguments[1] as t.Expression;
        hoisted.push(
          t.variableDeclaration("const", [
            t.variableDeclarator(reduceFnId, argFn as any),
          ])
        );
        break;
      } else {
        finalExpr = steps.slice(idx).reduce<t.Expression>((prev, s) => {
          if (t.isMemberExpression(s.callee)) {
            return t.callExpression(
              t.memberExpression(prev, s.callee.property),
              s.arguments as t.Expression[]
            );
          }
          return prev;
        }, resultId);
        break;
      }
    }

    const loopBody: t.Statement[] = [];
    loopBody.push(
      t.variableDeclaration("let", [
        t.variableDeclarator(x, t.memberExpression(input, i, true)),
      ])
    );

    loopBody.push(...transforms);

    if (reduce && reduceFnId) {
      loopBody.push(
        t.expressionStatement(
          t.assignmentExpression(
            "=",
            resultId,
            t.callExpression(reduceFnId, [resultId, currentVal])
          )
        )
      );
    } else {
      loopBody.push(
        t.expressionStatement(
          t.callExpression(t.memberExpression(resultId, t.identifier("push")), [
            currentVal,
          ])
        )
      );
    }

    const loop = t.forStatement(
      t.variableDeclaration("let", [
        t.variableDeclarator(i, t.numericLiteral(0)),
      ]),
      t.binaryExpression(
        "<",
        i,
        t.memberExpression(input, t.identifier("length"))
      ),
      t.updateExpression("++", i),
      t.blockStatement(loopBody)
    );

    const block: t.Statement[] = [];

    block.push(...hoisted);

    block.push(
      t.expressionStatement(
        t.assignmentExpression(
          "=",
          resultId,
          reduce && reduceInit
            ? reduceInit
            : t.newExpression(t.identifier("Array"), [])
        )
      )
    );

    block.push(loop);

    if (!(t.isIdentifier(finalExpr) && finalExpr.name === resultId.name)) {
      block.push(
        t.expressionStatement(t.assignmentExpression("=", resultId, finalExpr))
      );
    }

    const outerLet = t.variableDeclaration("let", [
      t.variableDeclarator(resultId),
    ]);
    context.helpers.replaceNode(context.parent!, [
      outerLet,
      t.blockStatement(block),
    ]);
    return null;
  },
};

function isFn(n: any): n is t.ArrowFunctionExpression | t.FunctionExpression {
  return t.isArrowFunctionExpression(n) || t.isFunctionExpression(n);
}

function isFusableChain(expr: t.Expression | null): boolean {
  if (!expr || !t.isCallExpression(expr)) return false;

  let current: t.Expression = expr;
  let count = 0;
  while (t.isCallExpression(current) && t.isMemberExpression(current.callee)) {
    const method = current.callee.property;
    if (!t.isIdentifier(method)) return false;
    if (["map", "filter", "reduce"].includes(method.name)) {
      count++;
      current = current.callee.object;
    } else {
      break;
    }
  }
  return count >= 1;
}
