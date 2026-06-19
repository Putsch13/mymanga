import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Les URLs Fal.ai / Supabase sont signées dynamiquement et ne peuvent pas
      // passer par next/image sans configuration de domaines exhaustive.
      // Le reader manga utilise <img> intentionnellement pour les panels générés.
      "@next/next/no-img-element": "warn",
    },
  },
];

export default eslintConfig;
