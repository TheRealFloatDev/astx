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

    // 1. Walk and collect the entire chain (right to left)
    while (
      t.isCallExpression(current) &&
      t.isMemberExpression(current.callee)
    ) {
      steps.unshift(current);
      current = current.callee.object;
    }

    const input = current;
    const chainLen = steps.length;

    // 2. Determine operations: map / filter / reduce
    const fusedOps: {
      type: "map" | "filter" | "reduce";
      fn: t.FunctionExpression | t.ArrowFunctionExpression;
      index: number;
      raw: t.CallExpression;
    }[] = [];

    for (let i = 0; i < chainLen; i++) {
      const call = steps[i];
      if (!t.isMemberExpression(call.callee)) continue;
      const method = call.callee.property;

      if (t.isIdentifier(method, { name: "map" }) && isFn(call.arguments[0])) {
        fusedOps.push({
          type: "map",
          fn: call.arguments[0] as any,
          index: i,
          raw: call,
        });
      } else if (
        t.isIdentifier(method, { name: "filter" }) &&
        isFn(call.arguments[0])
      ) {
        fusedOps.push({
          type: "filter",
          fn: call.arguments[0] as any,
          index: i,
          raw: call,
        });
      } else if (
        t.isIdentifier(method, { name: "reduce" }) &&
        isFn(call.arguments[0]) &&
        call.arguments.length === 2
      ) {
        fusedOps.push({
          type: "reduce",
          fn: call.arguments[0] as any,
          index: i,
          raw: call,
        });
        break; // Stop here, we fuse only up to reduce
      } else {
        break;
      }
    }

    // Must end with reduce and have at least 1 map/filter before it
    const reduce = findLast(fusedOps, (op) => op.type === "reduce");
    if (!reduce || fusedOps.length < 2) return node;

    const reduceIndex = fusedOps.indexOf(reduce);
    const fused = fusedOps.slice(0, reduceIndex + 1);

    const acc = context.helpers.generateUid("acc");
    const i = context.helpers.generateUid("i");
    const x = context.helpers.generateUid("x");

    const reducerFnId = context.helpers.generateUid("reducerFn");

    const hoistedFns: t.VariableDeclaration[] = [];
    const reducerFn = reduce.fn;
    const reducerInit = reduce.raw.arguments[1] as t.Expression;

    // Hoist reducer
    hoistedFns.push(
      t.variableDeclaration("const", [
        t.variableDeclarator(reducerFnId, reducerFn),
      ])
    );

    const bodyStatements: t.Statement[] = [];

    // let acc = initial;
    bodyStatements.push(
      t.variableDeclaration("let", [t.variableDeclarator(acc, reducerInit)])
    );

    // Build loop
    const loopBody: t.Statement[] = [];

    // let x = input[i]
    loopBody.push(
      t.variableDeclaration("let", [
        t.variableDeclarator(x, t.memberExpression(input, i, true)),
      ])
    );

    // Apply maps and filters before reduce
    for (const op of fused) {
      if (op.type === "map" && op !== reduce) {
        const fnId = context.helpers.generateUid("mapFn");
        hoistedFns.push(
          t.variableDeclaration("const", [t.variableDeclarator(fnId, op.fn)])
        );
        loopBody.push(
          t.expressionStatement(
            t.assignmentExpression("=", x, t.callExpression(fnId, [x]))
          )
        );
      } else if (op.type === "filter") {
        const fnId = context.helpers.generateUid("filterFn");
        hoistedFns.push(
          t.variableDeclaration("const", [t.variableDeclarator(fnId, op.fn)])
        );
        loopBody.push(
          t.ifStatement(
            t.unaryExpression("!", t.callExpression(fnId, [x])),
            t.continueStatement()
          )
        );
      }
    }

    // Apply reduce: acc = reducerFn(acc, x)
    loopBody.push(
      t.expressionStatement(
        t.assignmentExpression(
          "=",
          t.identifier(acc.name),
          t.callExpression(reducerFnId, [t.identifier(acc.name), x])
        )
      )
    );

    // Loop
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

    bodyStatements.push(loop);

    // Handle tail after reduce (e.g. .toString())
    let resultExpr: t.Expression = t.identifier(acc.name);
    for (let j = reduce.index + 1; j < steps.length; j++) {
      const step = steps[j];
      if (t.isMemberExpression(step.callee)) {
        resultExpr = t.callExpression(
          t.memberExpression(resultExpr, step.callee.property),
          step.arguments as t.Expression[]
        );
      }
    }

    const resultLet = t.variableDeclaration("let", [
      t.variableDeclarator(node.id),
    ]);

    const finalAssign = t.expressionStatement(
      t.assignmentExpression("=", node.id as t.LVal, resultExpr)
    );

    // Replace with hoisted + block
    context.helpers.replaceNode(context.parent!, [
      resultLet,
      t.blockStatement([...hoistedFns, ...bodyStatements, finalAssign]),
    ]);

    return null;
  },
};

// Helpers

function isFusableChain(expr: t.Expression | null): boolean {
  if (!expr || !t.isCallExpression(expr)) return false;

  let current: t.Expression = expr;
  let sawReduce = false;
  let count = 0;

  while (t.isCallExpression(current) && t.isMemberExpression(current.callee)) {
    const prop = current.callee.property;
    if (!t.isIdentifier(prop)) break;

    if (["map", "filter", "reduce"].includes(prop.name)) {
      count++;
      if (prop.name === "reduce") sawReduce = true;
      current = current.callee.object;
    } else {
      break;
    }
  }

  return sawReduce && count >= 2;
}

function isFn(
  node: unknown
): node is t.FunctionExpression | t.ArrowFunctionExpression {
  if (!node) return false;
  if (!t.isNode(node)) return false;

  if (!t.isFunctionExpression(node) && !t.isArrowFunctionExpression(node)) {
    return false;
  }

  return t.isFunctionExpression(node) || t.isArrowFunctionExpression(node);
}

function findLast<T>(arr: T[], predicate: (item: T) => boolean): T | undefined {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return arr[i];
  }
  return undefined;
}
