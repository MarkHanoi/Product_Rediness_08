import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // happy-dom: the @pryzm/core-app-model barrel transitively pulls @thatopen/ui
    // (a web-component lib) which touches HTMLElement / document / customElements
    // at module-load time. happy-dom provides that DOM surface (same env the root
    // vitest.config.ts uses). THREE itself works fine under it.
    environment: 'happy-dom',
    include: ['__tests__/**/*.test.ts'],
  },
});
