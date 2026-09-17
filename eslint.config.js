import globals from 'globals';

export default [
    {
        ignores: ['node_modules/**', 'public/js/*.min.js']
    },
    {
        files: ['app.js', 'eslint.config.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: globals.node
        },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': ['error', { args: 'none' }],
            'prefer-const': 'error',
            'no-var': 'error'
        }
    },
    {
        files: ['public/js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'script',
            globals: { ...globals.browser, ...globals.jquery }
        },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': 'warn',
            'no-var': 'error'
        }
    }
];
