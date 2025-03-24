import * as t from "@babel/types";
import { NodeTransformer } from "./transformers";

export const UnchainReduceToLoopTransformer: NodeTransformer<t.VariableDeclarator> =
  {
    key: "reduce-unchain-to-loop",
    displayName: "Unchain .reduce() with Loop (Hoisted)",
    nodeTypes: ["VariableDeclarator"],
    phases: ["main"],

    test(node) {
      return t.isVariableDeclarator(node) && isReduceCall(node.init);
    },

    transform(node, context) {
      const init = node.init;
      if (!init || !t.isCallExpression(init)) return node;

      const chain: t.CallExpression[] = [];
      let current: t.Expression = init;

      // Walk call chain left to right
      while (
        t.isCallExpression(current) &&
        t.isMemberExpression(current.callee)
      ) {
        chain.unshift(current);
        current = current.callee.object;
      }

      const arrayExpr = current;
      const reduceIndex = chain.findIndex(
        (c) =>
          t.isMemberExpression(c.callee) &&
          t.isIdentifier(c.callee.property, { name: "reduce" })
      );

      if (reduceIndex === -1) return node;

      const reduceCall = chain[reduceIndex];
      const reducerFn = reduceCall.arguments[0] as
        | t.FunctionExpression
        | t.ArrowFunctionExpression;
      const initialValue = reduceCall.arguments[1] as t.Expression;

      const acc = context.helpers.generateUid("acc");
      const i = context.helpers.generateUid("i");
      const reducerId = context.helpers.generateUid("reducerFn");
      const preReduceTemp = context.helpers.generateUid("tmp_chain");

      const bodyStatements: t.Statement[] = [];

      let arrayToReduce: t.Identifier | t.Expression = arrayExpr;

      // 🧠 Optional pre-reduce chain
      if (reduceIndex > 0) {
        const preReduceExpr = t.callExpression(
          chain.slice(0, reduceIndex).reduce((obj, call) => {
            return t.callExpression(
              t.memberExpression(
                obj,
                (call.callee as t.MemberExpression).property
              ),
              call.arguments as t.Expression[]
            );
          }, arrayExpr),
          []
        );

        bodyStatements.push(
          t.variableDeclaration("const", [
            t.variableDeclarator(preReduceTemp, preReduceExpr),
          ])
        );

        arrayToReduce = preReduceTemp;
      }

      // ✅ Hoist reducer function
      bodyStatements.push(
        t.variableDeclaration("const", [
          t.variableDeclarator(reducerId, reducerFn),
        ])
      );

      // let acc = <init>
      bodyStatements.push(
        t.variableDeclaration("let", [t.variableDeclarator(acc, initialValue)])
      );

      // for (...) acc = reducerFn(acc, array[i])
      const loop = t.forStatement(
        t.variableDeclaration("let", [
          t.variableDeclarator(i, t.numericLiteral(0)),
        ]),
        t.binaryExpression(
          "<",
          i,
          t.memberExpression(arrayToReduce, t.identifier("length"))
        ),
        t.updateExpression("++", i),
        t.blockStatement([
          t.expressionStatement(
            t.assignmentExpression(
              "=",
              t.identifier(acc.name),
              t.callExpression(reducerId, [
                t.identifier(acc.name),
                t.memberExpression(arrayToReduce, i, true),
              ])
            )
          ),
        ])
      );

      bodyStatements.push(loop);

      // Handle tail expressions
      let resultExpr: t.Expression = t.identifier(acc.name);
      for (let j = reduceIndex + 1; j < chain.length; j++) {
        const call = chain[j];
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

      // result = acc;
      const finalAssign = t.expressionStatement(
        t.assignmentExpression("=", node.id as t.LVal, resultExpr)
      );

      context.helpers.replaceNode(context.parent!, [
        resultLet,
        t.blockStatement([...bodyStatements, finalAssign]),
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
