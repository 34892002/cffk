import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { describe, test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverRoot = path.join(projectRoot, "server");
const stableCodePattern = /^[A-Z][A-Z0-9_:-]+$/;

async function findTelefuncFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async entry => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findTelefuncFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".telefunc.ts") ? [entryPath] : [];
  }));
  return files.flat().sort();
}

function hasExportModifier(node: ts.Node) {
  return ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function isTelefuncActionCall(expression: ts.Expression | undefined) {
  return Boolean(expression && ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === "telefuncAction");
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function inspectTelefuncFile(sourceFile: ts.SourceFile) {
  const failures: string[] = [];
  const localInitializers = new Map<string, ts.Expression | undefined>();
  let importsTelefuncAction = false;

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && statement.moduleSpecifier.getText(sourceFile) === '"@/server/telefunc-action"') {
      importsTelefuncAction = statement.importClause?.namedBindings !== undefined
        && ts.isNamedImports(statement.importClause.namedBindings)
        && statement.importClause.namedBindings.elements.some(element => element.name.text === "telefuncAction" && (element.propertyName?.text ?? "telefuncAction") === "telefuncAction");
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        localInitializers.set(declaration.name.text, declaration.initializer);
        if (hasExportModifier(statement) && declaration.name.text.startsWith("on") && !isTelefuncActionCall(declaration.initializer)) {
          failures.push(`${declaration.name.text} is not wrapped with telefuncAction() at line ${lineOf(sourceFile, declaration)}`);
        }
      }
    } else if (ts.isFunctionDeclaration(statement) && hasExportModifier(statement) && statement.name?.text.startsWith("on")) {
      failures.push(`${statement.name.text} is not a telefuncAction() variable export at line ${lineOf(sourceFile, statement)}`);
    } else if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        const exportedName = element.name.text;
        const localName = element.propertyName?.text ?? exportedName;
        if (exportedName.startsWith("on") && !isTelefuncActionCall(localInitializers.get(localName))) {
          failures.push(`${exportedName} is not wrapped with telefuncAction() at line ${lineOf(sourceFile, element)}`);
        }
      }
    }
  }

  const visit = (node: ts.Node) => {
    if (ts.isThrowStatement(node) && node.expression && ts.isNewExpression(node.expression)
      && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "Error"
      && node.expression.arguments?.length === 1 && ts.isStringLiteralLike(node.expression.arguments[0])
      && stableCodePattern.test(node.expression.arguments[0].text)) {
      failures.push(`stable business code thrown with new Error() at line ${lineOf(sourceFile, node)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  if (!importsTelefuncAction) failures.push('must import telefuncAction from "@/server/telefunc-action"');
  return failures;
}

describe("Telefunc architecture", () => {
  test("all on* exports use telefuncAction and stable codes use AppError", async () => {
    const files = await findTelefuncFiles(serverRoot);
    assert.ok(files.length > 0, "expected at least one server/**/*.telefunc.ts file");

    const failures: string[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      for (const failure of inspectTelefuncFile(sourceFile)) {
        failures.push(`${path.relative(projectRoot, file)}: ${failure}`);
      }
    }

    assert.deepEqual(failures, []);
  });
});
