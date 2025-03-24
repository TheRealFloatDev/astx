import * as t from "@babel/types";
import { NodeTransformer } from "./transformers";

export const UnchainMapToLoopTransformer: NodeTransformer<t.VariableDeclarator> =
  {
    key: "map-unchain-to-loop",
    displayName: "Unchain .map() to Preallocated Loops (Scoped, Hoisted)",
    nodeTypes: ["VariableDeclarator"],
    phases: ["main"],

    test(node) {
      return t.isVariableDeclarator(node) && containsMapCall(node.init);
    },

    transform(node, context) {
      if (!node.init || !t.isCallExpression(node.init)) return node;

      const chain: t.Expression[] = [];
      let current: t.Expression = node.init;

      while (
        t.isCallExpression(current) &&
        t.isMemberExpression(current.callee)
      ) {
        chain.unshift(current);
        current = current.callee.object;
      }

      const inputExpr = current;
      const statements: t.Statement[] = [];
      const hoistedFns: t.VariableDeclaration[] = [];
      let prev = inputExpr;
      let lastTemp: t.Identifier | null = null;

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
          const originalFn = callExpr.arguments[0] as
            | t.FunctionExpression
            | t.ArrowFunctionExpression;
          const fnId = context.helpers.generateUid(`mapFn${i}`);
          const tmp = context.helpers.generateUid(`tmp${i + 1}`);
          const index = context.helpers.generateUid("i");
          const inputLen = t.memberExpression(prev, t.identifier("length"));

          // Hoist: const mapFnN = (x) => ...
          hoistedFns.push(
            t.variableDeclaration("const", [
              t.variableDeclarator(fnId, originalFn),
            ])
          );

          // Create: const tmpN = new Array(prev.length)
          statements.push(
            t.variableDeclaration("const", [
              t.variableDeclarator(
                tmp,
                t.newExpression(t.identifier("Array"), [inputLen])
              ),
            ])
          );

          // Call: tmp[i] = mapFn(input[i])
          const mapCall = t.callExpression(fnId, [
            t.memberExpression(prev, index, true),
          ]);

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
          // Any non-map call like .filter(), .slice(), etc.
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

      // Final assignment
      statements.push(
        t.expressionStatement(
          t.assignmentExpression("=", node.id as t.LVal, lastTemp!)
        )
      );

      const resultLet = t.variableDeclaration("let", [
        t.variableDeclarator(node.id),
      ]);

      const block = t.blockStatement([...hoistedFns, ...statements]);

      context.helpers.replaceNode(context.parent!, [resultLet, block]);

      return null;
    },
  };

function containsMapCall(expr?: t.Expression | null): boolean {
  if (!expr || !t.isCallExpression(expr)) return false;

  let current: t.Expression = expr;
  while (t.isCallExpression(current) && t.isMemberExpression(current.callee)) {
    if (
      t.isIdentifier(current.callee.property, { name: "map" }) &&
      (t.isArrowFunctionExpression(current.arguments[0]) ||
        t.isFunctionExpression(current.arguments[0]))
    ) {
      return true;
    }
    current = current.callee.object;
  }

  return false;
}
