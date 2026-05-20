// PM2 Process Manager Configuration
// Start:   pm2 start ecosystem.config.js
// Restart: pm2 restart hospitalos
// Logs:    pm2 logs hospitalos
// Monitor: pm2 monit

module.exports = {
  apps: [
    {
      name: "hospitalos",
      script: "node_modules/.bin/next",
      args: "start -p 3000",
      cwd: "/home/ubuntu/hospitalos",

      // Environment
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },

      // Process management
      instances: "max",         // Use all CPU cores
      exec_mode: "cluster",     // Cluster mode for load balancing
      max_memory_restart: "1G", // Restart if memory exceeds 1 GB

      // Auto-restart
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,      // 5 sec delay between restarts

      // Logs
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "/home/ubuntu/hospitalos/logs/error.log",
      out_file: "/home/ubuntu/hospitalos/logs/output.log",
      merge_logs: true,
      log_type: "json",

      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 10000,
    },
  ],
};
