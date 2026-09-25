const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      // Port par défaut du backend (PORT=5000) ; surchargeable via API_PROXY_TARGET
      target: process.env.API_PROXY_TARGET || 'http://localhost:5000',
      changeOrigin: true,
    })
  );
};
