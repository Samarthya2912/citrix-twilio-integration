module.exports = {
  entry: './public/quickstart.js', // Your main JS file
  output: {
    filename: 'bundle.js',
    path: __dirname + '/public/dist',
  },
  resolve: {
    fallback: {
      fs: false, // Disable Node.js-specific features
    },
  },
  mode: 'development', // This alone disables minification
};
