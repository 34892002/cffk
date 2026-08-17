import eslint from "@eslint/js";
import pluginVue from "eslint-plugin-vue";
import globals from "globals";
import tseslint, { type ConfigArray } from "typescript-eslint";
import vueParser from "vue-eslint-parser";

export default tseslint.config(
  {
    ignores: [
      "dist/*",
      // Temporary compiled files
      "**/*.ts.build-*.mjs",
      "worker-configuration.d.ts",
      // JS files at the root of the project
      "*.js",
      "*.cjs",
      "*.mjs",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        warnOnUnsupportedTypeScriptVersion: false,
        sourceType: "module",
        ecmaVersion: "latest",
      },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        1,
        {
          argsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-namespace": 0,
    },
  },
  {
    files: ["**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        sourceType: "module",
        ecmaVersion: "latest",
      },
    },
  },
  ...(pluginVue.configs["flat/recommended"] as ConfigArray),
  {
    rules: {
      "vue/multi-word-component-names": "off",
      "vue/singleline-html-element-content-newline": "off",
      "vue/max-attributes-per-line": "off",
      "vue/html-self-closing": "off",
      // shadcn-vue components use optional passthrough props with withDefaults.
      "vue/require-default-prop": "off",
    },
    languageOptions: {
      sourceType: "module",
      globals: {
        ...globals.browser,
      },
    },
  },
);
