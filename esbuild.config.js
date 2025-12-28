import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

const isWatch = process.argv.includes('--watch');

// HTML template for editor
const editorHtmlTemplate = (js, css) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CYOA Story Editor</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.6/purify.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.28.1/cytoscape.min.js"></script>
    <style>
${css}
    </style>
</head>
<body>
    <div id="app"></div>
    <script type="module">
${js}
    </script>
</body>
</html>`;

// HTML template for engine
const engineHtmlTemplate = (js, css) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Choose Your Own Adventure</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.6/purify.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
    <style>
${css}
    </style>
</head>
<body>
    <div id="app"></div>
    <script type="module">
${js}
    </script>
</body>
</html>`;

// Plugin to bundle into single HTML files
const htmlBundlePlugin = {
    name: 'html-bundle',
    setup(build) {
        build.onEnd(async (result) => {
            if (result.errors.length > 0) return;

            // Read built files
            const editorJs = fs.readFileSync('dist/editor.js', 'utf8');
            const editorCss = fs.readFileSync('dist/editor.css', 'utf8');
            const engineJs = fs.readFileSync('dist/engine.js', 'utf8');
            const engineCss = fs.readFileSync('dist/engine.css', 'utf8');

            // Write bundled HTML files
            fs.writeFileSync('dist/editor.html', editorHtmlTemplate(editorJs, editorCss));
            fs.writeFileSync('dist/engine.html', engineHtmlTemplate(engineJs, engineCss));

            console.log('Built: dist/editor.html, dist/engine.html');
        });
    }
};

// Common build options
const commonOptions = {
    bundle: true,
    format: 'esm',
    target: 'es2020',
    sourcemap: isWatch,
    minify: !isWatch,
    external: ['DOMPurify', 'JSZip', 'cytoscape'],
};

async function build() {
    // Build editor
    await esbuild.build({
        ...commonOptions,
        entryPoints: ['src/ts/editor/main.ts'],
        outfile: 'dist/editor.js',
    });

    // Build editor CSS
    await esbuild.build({
        entryPoints: ['src/css/editor.css'],
        outfile: 'dist/editor.css',
        bundle: true,
        minify: !isWatch,
    });

    // Build engine
    await esbuild.build({
        ...commonOptions,
        entryPoints: ['src/ts/engine/main.ts'],
        outfile: 'dist/engine.js',
    });

    // Build engine CSS
    await esbuild.build({
        entryPoints: ['src/css/engine.css'],
        outfile: 'dist/engine.css',
        bundle: true,
        minify: !isWatch,
    });

    // Bundle into HTML
    const editorJs = fs.readFileSync('dist/editor.js', 'utf8');
    const editorCss = fs.readFileSync('dist/editor.css', 'utf8');
    const engineJs = fs.readFileSync('dist/engine.js', 'utf8');
    const engineCss = fs.readFileSync('dist/engine.css', 'utf8');

    fs.writeFileSync('dist/editor.html', editorHtmlTemplate(editorJs, editorCss));
    fs.writeFileSync('dist/engine.html', engineHtmlTemplate(engineJs, engineCss));

    console.log('Build complete!');
}

async function watch() {
    // Watch mode contexts
    const contexts = await Promise.all([
        esbuild.context({
            ...commonOptions,
            entryPoints: ['src/ts/editor/main.ts'],
            outfile: 'dist/editor.js',
            plugins: [htmlBundlePlugin],
        }),
        esbuild.context({
            entryPoints: ['src/css/editor.css'],
            outfile: 'dist/editor.css',
            bundle: true,
        }),
        esbuild.context({
            ...commonOptions,
            entryPoints: ['src/ts/engine/main.ts'],
            outfile: 'dist/engine.js',
            plugins: [htmlBundlePlugin],
        }),
        esbuild.context({
            entryPoints: ['src/css/engine.css'],
            outfile: 'dist/engine.css',
            bundle: true,
        }),
    ]);

    await Promise.all(contexts.map(ctx => ctx.watch()));
    console.log('Watching for changes...');
}

if (isWatch) {
    watch().catch(console.error);
} else {
    build().catch(console.error);
}
