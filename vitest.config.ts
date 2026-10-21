import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
    resolve: { alias: { '@': path.resolve(__dirname) } },
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        // pure-logic tests only: none of them may need a database, network or Next runtime
        testTimeout: 10_000,
    },
});
