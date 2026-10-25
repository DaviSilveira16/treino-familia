const { defineConfig } = require("eslint/config");
const expo = require("eslint-config-expo/flat");
module.exports = defineConfig([
  expo,
  { ignores: ["dist/**", "node_modules/**", ".expo/**"] },
  // The app does not enable React Compiler. Keep its migration diagnostics
  // visible as warnings while enforcing Hook ordering and the normal JS rules.
  { rules: { "react-hooks/refs": "warn", "react-hooks/set-state-in-effect": "warn", "react-hooks/preserve-manual-memoization": "warn" } },
  { files: ["testes/**/*.{js,cjs}", "scripts/**/*.cjs"], languageOptions: { globals: { require: "readonly", module: "readonly", __dirname: "readonly", process: "readonly", Buffer: "readonly" } } },
]);
