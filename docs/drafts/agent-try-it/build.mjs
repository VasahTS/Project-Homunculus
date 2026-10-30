// Portable visual draft built from the app's current tokens and styles. CODEX, 2026-10-30.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { BUILTIN_PROFILES } from "../../../apps/desktop/src/theme/themes.ts";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../../..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
const syntax = ts.createSourceFile("agents.ts", source("apps/desktop/src/agents.ts"), ts.ScriptTarget.Latest, true);
const agents = [];
const wanted = ["starter-prose-polisher", "starter-dont-write-for-user", "starter-lorebook-keeper", "starter-cyoa-choices"];
const property = (object, key) => object.properties.find((p) => p.name?.getText(syntax).replaceAll('"', "").replaceAll("'", "") === key)?.initializer;
const literal = (node) => node && ts.isStringLiteral(node) ? node.text : node && ts.isNumericLiteral(node) ? Number(node.text) : undefined;
function visit(node) {
  if (ts.isObjectLiteralExpression(node)) {
    const id = literal(property(node, "id"));
    if (wanted.includes(id)) {
      const input = property(node, "input");
      agents.push({ id, name: literal(property(node, "name")), help: literal(property(node, "help")), prompt: literal(property(node, "prompt")),
        output: literal(property(node, "output")), runMode: literal(property(node, "runMode")),
        messages: input && ts.isObjectLiteralExpression(input) ? literal(property(input, "messages")) ?? 0 : 0 });
    }
  }
  ts.forEachChild(node, visit);
}
visit(syntax);
if (!agents.some((a) => a.id === "starter-prose-polisher")) throw new Error("Source agent not found.");
const quiet = BUILTIN_PROFILES.find((p) => p.id === "quiet");
const profile = ":root{" + Object.entries(quiet.tokens).map(([key,value]) => "--" + key + ":" + value).join(";") + "}\n" + quiet.css;
const fonts = [400,600].map((weight) => {
  const font = fs.readFileSync(path.join(root, "node_modules/@fontsource/literata/files/literata-latin-" + weight + "-normal.woff2")).toString("base64");
  return '@font-face{font-family:Literata;font-style:normal;font-weight:' + weight + ';font-display:swap;src:url(data:font/woff2;base64,' + font + ') format("woff2")}';
}).join("\n");
const css = source("apps/desktop/src/theme/tokens.css").replace(/@import[^;]+;/g, "") + "\n" +
  source("apps/desktop/src/styles.css") + "\n" + profile + "\n" + fonts + "\n" + fs.readFileSync(path.join(dir,"draft.css"),"utf8");
const script = "const AGENTS = " + JSON.stringify(agents) + ";\n" + fs.readFileSync(path.join(dir,"draft.js"),"utf8");
const html = fs.readFileSync(path.join(dir,"index.template.html"),"utf8").replace("/* EMBED_STYLES */",css).replace("/* EMBED_SCRIPT */",script);
fs.writeFileSync(path.join(dir,"index.html"),html);
fs.copyFileSync(path.join(root,"node_modules/@fontsource/literata/LICENSE"),path.join(dir,"Literata-LICENSE.txt"));
console.log("Built portable Try it draft with " + agents.length + " project agents.");
