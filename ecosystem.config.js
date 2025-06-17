module.exports = {
  apps: [
    {
      name: 'clash-config-server', // Application name
      script: 'server/index.js', // Entry script
      instances: 1, // Number of instances (1 = fork mode)
      autorestart: true, // Auto restart on crash
      watch: false, // Disable file watching in production
      max_memory_restart: '1G', // Restart if memory exceeds 1G
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z', // Log date format
      error_file: './logs/error.log', // Error log path
      out_file: './logs/out.log', // Output log path
      combine_logs: true, // Combine stdout and stderr if paths are identical
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        // ADMIN_USERNAME: 'your_prod_admin_username',
        // ADMIN_PASSWORD: 'your_prod_admin_password',
      },
    },
  ],
};
