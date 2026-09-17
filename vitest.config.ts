import { defineConfig } from 'vitest/config';

// Keep unit tests independent of the application's PWA/build plugins.
export default defineConfig({
    test: {
        environment: 'jsdom',
        isolate: true,
        include: ['src/**/*.test.{ts,tsx}'],
    },
});