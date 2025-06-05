module.exports = {
  apps: [
    {
      name: 'clash-config-server', // 应用程序名称
      script: 'server/index.js', // 应用程序的启动脚本
      instances: 1, // 启动实例数量，1 表示 fork mode
      autorestart: true, // 程序崩溃后自动重启
      watch: false, // 不建议在生产环境开启 watch，除非您有特定需求
      max_memory_restart: '1G', // 如果应用内存占用超过 1G 则重启
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z', // 日志日期格式
      error_file: 'logs/error.log', // 错误日志路径
      out_file: 'logs/out.log', // 普通输出日志路径
      combine_logs: true, // 是否合并普通日志和错误日志 (如果 out_file 和 error_file 相同)
      env_production: {
        NODE_ENV: 'production',
        // PORT: 3000, // 从 .env 文件读取端口，例如 PORT=3000
        // 重要：请在您的服务器上通过实际的环境变量或 PM2 的方式设置以下敏感信息
        // ADMIN_USERNAME: 'your_prod_admin_username',
        // ADMIN_PASSWORD: 'your_prod_admin_password',
        // 或者，如果您的服务器环境已经配置了这些环境变量，PM2 会自动使用它们。
        // 您也可以在启动时通过 PM2 命令行传递环境变量，或者修改此文件（但不推荐硬编码密码）。
      },
    },
  ],
};
