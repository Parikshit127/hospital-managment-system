// PM2 Process Manager Configuration — Azure VM variant
// Identical to ecosystem.config.js except paths use the Azure VM's default
// "azureuser" home directory instead of EC2's "ubuntu".
// Start:   pm2 start azure/ecosystem.azure.config.js
// Restart: pm2 restart hospitalos
// Logs:    pm2 logs hospitalos

module.exports = {
  apps: [
    {
      name: "hospitalos",
      script: "node_modules/.bin/next",
      args: "start -p 3000",
      cwd: "/home/azureuser/hospitalos",

      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },

      instances: "max",
      exec_mode: "cluster",
      max_memory_restart: "1G",

      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,

      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "/home/azureuser/hospitalos/logs/error.log",
      out_file: "/home/azureuser/hospitalos/logs/output.log",
      merge_logs: true,
      log_type: "json",

      kill_timeout: 5000,
      listen_timeout: 10000,
    },
  ],
};
