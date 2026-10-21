/**
 * Read the first `const NAME = <literal>` (top-level or nested) out of a source file WITHOUT importing it.
 * Needed because the legacy access maps live in files that cannot be imported from a script
 * (proxy.ts runs validateServerEnv() on import; session.ts is a 'use server' module that
 * must not export non-async values). Identifiers inside the literal (e.g. a lucide icon
 * component `icon: Users`) are returned as their name string.
 */
import * as fs from 'node:fs';
import ts from 'typescript';

export function evalLiteral(node: ts.Node): unknown {
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
        return evalLiteral(node.expression);
    }
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if (ts.isIdentifier(node)) return node.text;
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(evalLiteral);
    if (ts.isObjectLiteralExpression(node)) {
        const out: Record<string, unknown> = {};
        for (const p of node.properties) {
            if (ts.isPropertyAssignment(p)) {
                const k = ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name) ? p.name.text : p.name.getText();
                out[k] = evalLiteral(p.initializer);
            } else if (ts.isShorthandPropertyAssignment(p)) {
                out[p.name.text] = p.name.text;
            } else {
                throw new Error(`Unsupported property kind in literal: ${ts.SyntaxKind[p.kind]}`);
            }
        }
        return out;
    }
    throw new Error(`Unsupported literal node: ${ts.SyntaxKind[node.kind]} → ${node.getText().slice(0, 60)}`);
}

export function extractConst(file: string, name: string): unknown {
    const src = fs.readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    let found: unknown;
    let hit = false;
    const visit = (n: ts.Node) => {
        if (hit) return;
        if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name && n.initializer) {
            found = evalLiteral(n.initializer);
            hit = true;
            return;
        }
        ts.forEachChild(n, visit);
    };
    visit(sf);
    if (hit) return found;
    throw new Error(`const ${name} not found in ${file}`);
}
