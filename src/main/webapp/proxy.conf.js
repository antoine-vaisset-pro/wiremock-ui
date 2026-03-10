module.exports = {
  "/__admin": {
    "target": "http://127.0.0.1:3001",
    "secure": false,
    "changeOrigin": false,
    "logLevel": "debug",
    "timeout": 30000,
    "proxyTimeout": 30000
  },
  "/api": {
    "target": "http://127.0.0.1:3001",
    "secure": false,
    "changeOrigin": false,
    "logLevel": "debug",
    "timeout": 30000,
    "proxyTimeout": 30000
  },
  "/ui/**": {
    "bypass": function(req) {
      console.log('[PROXY] Bypass /ui route:', req.url);
      return req.url;
    }
  },
  "/**": {
    "target": "http://127.0.0.1:3001",
    "secure": false,
    "changeOrigin": false,
    "logLevel": "debug",
    "timeout": 30000,
    "proxyTimeout": 30000,
    "bypass": function(req) {
      console.log('[PROXY] Request URL:', req.url);

      // Do not proxy Angular/Vite internal requests
      if (req.url.indexOf('/@vite') === 0 ||
          req.url.indexOf('/@angular') === 0 ||
          req.url.indexOf('/@fs') === 0 ||
          req.url.indexOf('/node_modules') === 0) {
        console.log('[PROXY] Bypass (Angular/Vite internal):', req.url);
        return req.url;
      }

      // Do not proxy root route (Angular)
      if (req.url === '/' || req.url === '/index.html') {
        console.log('[PROXY] Bypass (root/index):', req.url);
        return req.url;
      }

      // Do not proxy static files (.js, .css, .ico, etc.)
      const fileExtensions = ['.js', '.css', '.html', '.ico', '.png', '.jpg', '.svg', '.woff', '.woff2', '.ttf', '.map'];
      if (fileExtensions.some(ext => req.url.endsWith(ext))) {
        console.log('[PROXY] Bypass (static file):', req.url);
        return req.url;
      }

      // PRIORITY 4: Proxy WireMock Admin and API routes
      if (req.url.indexOf('/__admin') === 0 || req.url.indexOf('/api') === 0) {
        console.log('[PROXY] Proxify (WireMock):', req.url);
        return null;
      }

      // PRIORITY 5: All other routes → WireMock (mocked endpoints)
      console.log('[PROXY] Proxify (WireMock endpoint):', req.url);
      return null;
    }
  }
};

