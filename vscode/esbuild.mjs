// Bundle da extensão: o código dela + o núcleo da CLI (../src) num arquivo CommonJS só.
// Uso: node esbuild.mjs [--production] [--watch]
import { build, context } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

// A CLI lê JSON do disco com new URL('<caminho>', import.meta.url). Num bundle CommonJS o
// import.meta não existe: troca a leitura por um import do JSON, que o esbuild embute
const READ_JSON = /JSON\.parse\(readFileSync\(new URL\('([^']+\.json)', import\.meta\.url\), 'utf8'\)\)/g;
const inlineJsonReads = {
  name: 'inline-json-reads',
  setup(b) {
    b.onLoad({ filter: /[\\/]src[\\/].*\.js$/ }, (args) => {
      const source = readFileSync(args.path, 'utf8');
      if (!source.includes('import.meta.url')) return undefined;
      const imports = [];
      const contents = source.replace(READ_JSON, (_, path) => {
        const name = `__json${imports.length}`;
        imports.push(`import ${name} from ${JSON.stringify(path)};`);
        return name;
      });
      return { contents: `${imports.join('\n')}\n${contents}`, loader: 'js', resolveDir: dirname(args.path) };
    });
  },
};

// Garante que nenhum import.meta sobrou: no VS Code ele viraria undefined e a extensão quebraria
const noImportMeta = {
  name: 'no-import-meta',
  setup(b) {
    b.onEnd((result) => {
      const left = result.warnings.filter((w) => /import\.meta/.test(w.text));
      if (left.length) {
        result.errors.push(...left.map((w) => ({ ...w, text: `import.meta no bundle: ${w.text}` })));
      }
    });
  },
};

const options = {
  entryPoints: ['src/extension.js'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  outfile: 'dist/extension.cjs',
  external: ['vscode', '@anthropic-ai/sdk'],
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
  plugins: [inlineJsonReads, noImportMeta],
};

// O schema do .jira-commit.json vai junto: dá autocomplete no editor mesmo sem a CLI instalada
mkdirSync('dist', { recursive: true });
copyFileSync(resolve('../schema/jira-commit.schema.json'), 'dist/jira-commit.schema.json');

if (watch) await (await context(options)).watch();
else await build(options);
