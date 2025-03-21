import * as t from "@babel/types";
import { NodeTransformer, TransformContext } from "./transformers";

export const ForEachToForTransformer: NodeTransformer<t.CallExpression> = {
  phases: ["pre"],
  nodeTypes: ["CallExpression"],
  key: "forEach-to-for",
  displayName: "Convert .forEach() to for loop",

  test(node): node is t.CallExpression {
    return (
      t.isCallExpression(node) &&
      t.isMemberExpression(node.callee) &&
      t.isIdentifier(node.callee.property, { name: "forEach" }) &&
      node.arguments.length === 1 &&
      (t.isFunctionExpression(node.arguments[0]) ||
        t.isArrowFunctionExpression(node.arguments[0]))
    );
  },

  transform(node, context: TransformContext): t.Node {
    const array = (node.callee as t.MemberExpression).object;
    const callback = node.arguments[0] as
      | t.FunctionExpression
      | t.ArrowFunctionExpression;

    const [itemParamRaw, indexParamRaw] = callback.params;

    // Generate safe unique identifiers
    const indexId =
      indexParamRaw && t.isIdentifier(indexParamRaw)
        ? indexParamRaw
        : context.helpers.generateUid("i");

    const itemId =
      itemParamRaw && t.isIdentifier(itemParamRaw)
        ? itemParamRaw
        : context.helpers.generateUid("item");

    // Construct loop body
    const loopBodyStatements: t.Statement[] = [
      t.variableDeclaration("const", [
        t.variableDeclarator(itemId, t.memberExpression(array, indexId, true)),
      ]),
    ];

    if (t.isBlockStatement(callback.body)) {
      loopBodyStatements.push(...callback.body.body);
    } else {
      loopBodyStatements.push(t.expressionStatement(callback.body));
    }

    const loop = t.forStatement(
      t.variableDeclaration("let", [
        t.variableDeclarator(indexId, t.numericLiteral(0)),
      ]),
      t.binaryExpression(
        "<",
        indexId,
        t.memberExpression(array, t.identifier("length"))
      ),
      t.updateExpression("++", indexId),
      t.blockStatement(loopBodyStatements)
    );

    return loop;
  },
};
