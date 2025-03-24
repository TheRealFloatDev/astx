import * as t from "@babel/types";
import { NodeTransformer, TransformContext } from "./transformers";

export const UnchainReduceToLoopTransformer: NodeTransformer<t.VariableDeclarator> =
  {
    key: "reduce-unchain-to-loop",
    displayName: "Unchain .reduce() to Manual Loop with Tail Calls",
    nodeTypes: ["VariableDeclarator"],
    phases: ["main"],

    test(node) {
      return t.isVariableDeclarator(node) && isReduceCall(node.init);
    },

    transform(node, context) {
      if (!node.init || !t.isCallExpression(node.init)) return node;

      const chain: t.CallExpression[] = [];
      let current: t.Expression = node.init;

      // Collect call chain: reduce(...).toString().trim()...
      while (
        t.isCallExpression(current) &&
        t.isMemberExpression(current.callee)
      ) {
        chain.unshift(current);
        current = current.callee.object;
      }

      const arrayExpr = current; // input

      const reduceIndex = chain.findIndex(
        (call) =>
          t.isMemberExpression(call.callee) &&
          t.isIdentifier(call.callee.property, { name: "reduce" })
      );

      if (reduceIndex === -1) return node;

      const reduceCall = chain[reduceIndex];
      const reducer = reduceCall.arguments[0] as
        | t.FunctionExpression
        | t.ArrowFunctionExpression;
      const initial = reduceCall.arguments[1] as t.Expression;

      const acc = context.helpers.generateUid("acc");
      const i = context.helpers.generateUid("i");

      const elAccess = t.memberExpression(arrayExpr, i, true);
      const reducerArgs = [acc, elAccess];

      const reducerCall = t.isBlockStatement(reducer.body)
        ? t.callExpression(
            t.functionExpression(null, reducer.params, reducer.body),
            reducerArgs
          )
        : t.callExpression(
            t.arrowFunctionExpression(reducer.params, reducer.body),
            reducerArgs
          );

      const loop = t.forStatement(
        t.variableDeclaration("let", [
          t.variableDeclarator(i, t.numericLiteral(0)),
        ]),
        t.binaryExpression(
          "<",
          i,
          t.memberExpression(arrayExpr, t.identifier("length"))
        ),
        t.updateExpression("++", i),
        t.blockStatement([
          t.expressionStatement(t.assignmentExpression("=", acc, reducerCall)),
        ])
      );

      const statements: t.Statement[] = [];

      // let acc = initial;
      statements.push(
        t.variableDeclaration("let", [t.variableDeclarator(acc, initial)])
      );

      // for (...)
      statements.push(loop);

      // Rebuild remaining calls (tail)
      let resultExpr: t.Expression = acc;
      for (let i = reduceIndex + 1; i < chain.length; i++) {
        const call = chain[i];
        resultExpr = t.callExpression(
          t.memberExpression(
            resultExpr,
            (call.callee as t.MemberExpression).property
          ),
          call.arguments as t.Expression[]
        );
      }

      // let result;
      const resultLet = t.variableDeclaration("let", [
        t.variableDeclarator(node.id),
      ]);

      // result = finalExpr;
      const assign = t.expressionStatement(
        t.assignmentExpression("=", node.id as t.LVal, resultExpr)
      );

      context.helpers.replaceNode(context.parent!, [
        resultLet,
        t.blockStatement([...statements, assign]),
      ]);

      return null;
    },
  };

function isReduceCall(expr?: t.Expression | null): boolean {
  if (!expr || !t.isCallExpression(expr)) return false;

  while (t.isCallExpression(expr) && t.isMemberExpression(expr.callee)) {
    if (
      t.isIdentifier(expr.callee.property, { name: "reduce" }) &&
      expr.arguments.length === 2 &&
      (t.isArrowFunctionExpression(expr.arguments[0]) ||
        t.isFunctionExpression(expr.arguments[0]))
    ) {
      return true;
    }
    expr = expr.callee.object;
  }

  return false;
}
