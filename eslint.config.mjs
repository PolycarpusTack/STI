// eslint-config-next pulls in eslint-plugin-import which has a circular
// require('eslint') at module-load time that hangs ESLint v9. We bypass it
// by wiring the TypeScript parser directly. Rule load is slow on WSL (~30 s)
// due to /mnt/c/ I/O — not a hang, just filesystem latency.
import tsParser from "@typescript-eslint/parser";

const eslintConfig = [
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: { parser: tsParser },
  },
  {
    rules: {
      "no-unused-vars": "off",
      "no-console": "off",
      "no-debugger": "off",
      "no-empty": "off",
      "no-case-declarations": "off",
      "no-fallthrough": "off",
      "no-undef": "off",
      "no-unreachable": "off",
      "no-useless-escape": "off",
    },
  },
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills/**"],
  },
];

export default eslintConfig;
