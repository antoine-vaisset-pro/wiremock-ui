// @ts-check
const eslint = require("@eslint/js");
const tseslint = require("typescript-eslint");
const angularEslintPlugin = require("@angular-eslint/eslint-plugin");
const angularEslintPluginTemplate = require("@angular-eslint/eslint-plugin-template");
const angularTemplateParser = require("@angular-eslint/template-parser");

module.exports = tseslint.config(
  {
    files: ["**/*.ts"],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
    ],
    plugins: {
      "@angular-eslint": angularEslintPlugin,
    },
    rules: {
      ...angularEslintPlugin.configs.recommended.rules,
      "@angular-eslint/directive-selector": [
        "error",
        {
          type: "attribute",
          prefix: "app",
          style: "camelCase",
        },
      ],
      "@angular-eslint/component-selector": [
        "error",
        {
          type: "element",
          prefix: "app",
          style: "kebab-case",
        },
      ],
      // Downgrade stylistic rules to warnings to avoid blocking workflow on existing code
      "@angular-eslint/prefer-inject": "warn",
      "@angular-eslint/no-empty-lifecycle-method": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-inferrable-types": "warn",
      "@typescript-eslint/array-type": "warn",
      "@typescript-eslint/consistent-indexed-object-style": "warn",
      "@typescript-eslint/consistent-generic-constructors": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/prefer-for-of": "warn",
      "@typescript-eslint/no-empty-function": "warn",
      "prefer-const": "warn",
      "preserve-caught-error": "warn",
    },
  },
  {
    files: ["**/*.html"],
    languageOptions: {
      parser: angularTemplateParser,
    },
    plugins: {
      "@angular-eslint/template": angularEslintPluginTemplate,
    },
    rules: {
      ...angularEslintPluginTemplate.configs["recommended"].rules,
      "@angular-eslint/template/prefer-control-flow": "warn",
    },
  }
);

