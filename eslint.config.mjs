import globals from 'globals'
import pluginJs from '@eslint/js'

export default [
  { files: ['**/*.js'], languageOptions: { sourceType: 'commonjs' } },
  {
    languageOptions: { globals: { ...globals.browser, process: 'readonly', $: 'readonly', __dirname: 'readonly' } }
  },
  pluginJs.configs.recommended
]
