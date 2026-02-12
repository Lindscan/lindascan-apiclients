// babel.config.js
module.exports = {
  presets: [
    [
      "@babel/preset-env",
      {
        targets: { browsers: "> 0.5%, last 2 versions, not IE 11" },
        useBuiltIns: "usage",
        corejs: { version: 3, proposals: true },
        modules: false, // ESM
        shippedProposals: true
      }
    ]
  ],
  plugins: [
    ["@babel/plugin-transform-runtime", { corejs: 3 }]
  ]
};