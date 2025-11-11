// 根目录 hexo.config.js（覆盖原内容）
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = {
  server: {
    middleware: {
      // 代理规则：将所有以 /meting-proxy 开头的请求转发到目标 API
      '/meting-proxy': {
        handler: createProxyMiddleware({
          target: 'https://meting.jmstrand.cn',  // 原 API 地址（不变）
          changeOrigin: true,                    // 必须开启跨域
          pathRewrite: { 
            '^/meting-proxy': ''  // 去掉本地路径前缀，确保转发后地址正确
          },
          // 可选：打印代理日志，方便调试
          logLevel: 'debug'
        })
      }
    }
  }
};