import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import tseslint from "typescript-eslint"
import { globalIgnores } from "eslint/config"

export default tseslint.config([
    globalIgnores(["dist"]),
    {
        files: ["**/*.{ts,tsx}"],
        extends: [js.configs.recommended, tseslint.configs.recommended, reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
        languageOptions: {
            ecmaVersion: 2022,
            globals: globals.browser,
        },
        rules: {
            // eslint-plugin-react-hooks v7 ships the React Compiler oriented rules
            // (set-state-in-effect, preserve-manual-memoization, use-memo, ...).
            // They flag long-standing patterns in the existing dialogs/effects
            // (state reset on open, derived state in effects). Cleaning those up is
            // a dedicated refactor, not part of a dependency upgrade, so they are
            // disabled here to keep the pre-upgrade lint signal
            // (rules-of-hooks + exhaustive-deps) unchanged. Re-enable one rule at a
            // time while refactoring the flagged components.
            "react-hooks/set-state-in-effect": "off",
            "react-hooks/preserve-manual-memoization": "off",
            "react-hooks/use-memo": "off",
        },
    },
])
