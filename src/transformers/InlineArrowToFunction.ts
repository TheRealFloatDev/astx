import * as t from "@babel/types";
import { NodeTransformer, TransformContext } from "./transformers";

export const InlineArrowToFunctionTransformer: NodeTransformer<t.ArrowFunctionExpression> =
  {
    key: "inline-arrow-to-function",
    displayName: "Inline Arrow to Function Expression",
    nodeTypes: ["ArrowFunctionExpression"],
    phases: ["pre"],
    test: () => true,

    transform(node, context: TransformContext): t.Node {
      const body = t.isBlockStatement(node.body)
        ? node.body
        : t.blockStatement([t.returnStatement(node.body)]);

      const fn = t.functionExpression(
        null,
        node.params,
        body,
        node.generator ?? false,
        node.async ?? false
      );

      context.path.replaceWith(fn);
      return fn;
    },
  };
