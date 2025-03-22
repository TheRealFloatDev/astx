import * as t from "@babel/types";
import { NodeTransformer, TransformContext } from "./transformers";
import traverse from "@babel/traverse";
import { traverseFast } from "@babel/types";

const MIN_BLOCK_SIZE = 5;
const MAX_BLOCK_SIZE = 10;

const HASH_KEY = "dedupBlock.hashes";
const FN_KEY = "dedupBlock.functions";

export const DeduplicateBlocksTransformer: NodeTransformer<t.Program> = {
  key: "reused-block-dedup",
  displayName: "Deduplicate Reused Statement Blocks",
  nodeTypes: ["Program"],
  phases: ["post"],
  test: () => true,

  transform(node, context) {
    const blockHashes: Map<
      string,
      { fnId: t.Identifier; block: t.Statement[]; count: number }
    > = (context.sharedData[HASH_KEY] ??= new Map());

    const hoisted: t.FunctionDeclaration[] = [];

    // Pass 1: collect hashes
    traverse(node, {
      BlockStatement(path) {
        const stmts = path.node.body;
        for (let size = MAX_BLOCK_SIZE; size >= MIN_BLOCK_SIZE; size--) {
          for (let i = 0; i <= stmts.length - size; i++) {
            const slice = stmts.slice(i, i + size);
            if (!isSafe(slice)) continue;

            const hash = hashBlock(slice);
            let entry = blockHashes.get(hash);

            if (!entry) {
              const fnId = context.helpers.generateUid("dedup_block");
              const clonedBlock = slice.map((s) => t.cloneNode(s));
              entry = { fnId, block: clonedBlock, count: 0 };
              blockHashes.set(hash, entry);
            }

            entry.count++;
          }
        }
      },
    });

    // Pass 2: replace and hoist
    traverse(node, {
      BlockStatement(path) {
        const stmts = path.node.body;

        for (let size = MAX_BLOCK_SIZE; size >= MIN_BLOCK_SIZE; size--) {
          for (let i = 0; i <= stmts.length - size; i++) {
            const slice = stmts.slice(i, i + size);
            if (!isSafe(slice)) continue;

            const hash = hashBlock(slice);
            const entry = blockHashes.get(hash);
            if (!entry || entry.count < 2) continue;

            // Hoist if not yet hoisted
            if (!hoisted.find((fn) => fn.id?.name === entry.fnId.name)) {
              hoisted.push(
                t.functionDeclaration(
                  entry.fnId,
                  [],
                  t.blockStatement(entry.block)
                )
              );
            }

            // Replace block with function call
            stmts.splice(
              i,
              size,
              t.expressionStatement(t.callExpression(entry.fnId, []))
            );

            i += size - 1; // skip replaced area
            break; // one dedup per block
          }
        }
      },
    });

    // Inject hoisted functions at the top
    node.body.unshift(...hoisted);
    return node;
  },
};

// Helpers

function isSafe(stmts: t.Statement[]): boolean {
  return stmts.every((stmt) => {
    return (
      !t.isReturnStatement(stmt) &&
      !t.isThrowStatement(stmt) &&
      !t.isBreakStatement(stmt) &&
      !t.isContinueStatement(stmt) &&
      !usesLexicalContext(stmt)
    );
  });
}

function usesLexicalContext(node: t.Node): boolean {
  let found = false;
  traverseFast(node, (n) => {
    if (
      t.isThisExpression(n) ||
      t.isIdentifier(n, { name: "arguments" }) ||
      t.isSuper(n) ||
      (t.isMetaProperty(n) &&
        t.isIdentifier(n.meta, { name: "new" }) &&
        t.isIdentifier(n.property, { name: "target" }))
    ) {
      found = true;
    }
  });
  return found;
}

function hashBlock(stmts: t.Statement[]): string {
  return stmts.map((s) => s.type + "-" + hashShallow(s)).join(";");
}

function hashShallow(node: t.Node): string {
  if (t.isExpressionStatement(node) && t.isCallExpression(node.expression)) {
    const callee = node.expression.callee;
    return `call:${t.isIdentifier(callee) ? callee.name : "?"}`;
  }
  if (t.isVariableDeclaration(node)) {
    return node.declarations
      .map((d) =>
        t.isIdentifier(d.id) ? `${d.id.name}:${d.init?.type ?? "?"}` : "?"
      )
      .join(",");
  }
  return node.type;
}
