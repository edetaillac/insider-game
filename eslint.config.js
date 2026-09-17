import globals from 'globals';

export default [
    {
        ignores: ['node_modules/**', 'public/js/*.min.js']
    },
    {
        files: ['app.js', 'eslint.config.js', 'src/**/*.js', 'test/**/*.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: { ...globals.node, structuredClone: 'readonly' }
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
            sourceType: 'module',
            globals: { ...globals.browser, io: 'readonly' }
        },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': 'warn',
            'no-var': 'error'
        }
    }
];
