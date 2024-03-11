module.exports = {
  ignorePatterns: ['!**/*'],
  extends: ['../.eslintrc.js'],
  overrides: [
    {
      files: ['*.ts'],
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: __dirname
      }
    }
  ]
};
