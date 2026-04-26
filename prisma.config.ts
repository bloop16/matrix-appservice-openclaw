import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // env() throws when DATABASE_URL is absent (e.g. during `prisma generate` in CI).
    // Use process.env with a fallback so generate works; migrate/deploy still
    // require DATABASE_URL to be set in the environment.
    url: process.env['DATABASE_URL'] ?? 'postgresql://localhost/prisma_placeholder',
  },
});
