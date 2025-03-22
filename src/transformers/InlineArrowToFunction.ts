import * as t from "@babel/types";
import { NodeTransformer, TransformContext } from "./transformers";

export const InlineArrowToFunctionTransformer: NodeTransformer<t.ArrowFunctionExpression> =
  {
    key: "inline-arrow-to-function",
    displayName: "Inline Arrow → Function Expression",
    nodeTypes: ["ArrowFunctionExpression"],
    phases: ["pre"],
    test: () => true,

    transform(node): t.FunctionExpression {
      const body = t.isBlockStatement(node.body)
        ? node.body
        : t.blockStatement([t.returnStatement(node.body)]);

      return t.functionExpression(
        null,
        node.params,
        body,
        node.generator ?? false,
        node.async ?? false
      );
    },
  };
