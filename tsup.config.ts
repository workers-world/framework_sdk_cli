import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        'envelope/index': 'src/envelope/index.ts',
        'argv/index': 'src/argv/index.ts',
        'http/index': 'src/http/index.ts',
        'portal/index': 'src/portal/index.ts',
        'search/index': 'src/search/index.ts',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: true,
    target: 'node20',
});
