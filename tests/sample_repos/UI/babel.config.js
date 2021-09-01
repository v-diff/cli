module.exports = function (api) {
  api.cache(true);

  const presets = ['@babel/preset-env', '@babel/preset-typescript'];
  const plugins = [
    ["@babel/transform-runtime", {
      "regenerator": true
    }]
  ]

  return {
    presets,
    plugins
  };
}