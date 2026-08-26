import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts", "src/**/*.{test,spec}.tsx"],
    globals: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `server-only` throws when imported outside a React Server Component.
      // Unit tests only exercise the pure logic in services, so resolve it to a stub.
      "server-only": path.resolve(__dirname, "./src/lib/__tests__/stubs/server-only.ts"),
    },
  },
});
