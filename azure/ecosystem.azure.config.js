// PM2 Process Manager Configuration — Azure VM variant
// Identical to ecosystem.config.js except paths are derived from whichever
// user runs `pm2 start`, instead of EC2's hardcoded "ubuntu" home dir — your
// Azure VM's admin username can be anything (azureuser, parikshit889, ...).
// Start:   pm2 start azure/ecosystem.azure.config.js
// Restart: pm2 restart hospitalos
// Logs:    pm2 logs hospitalos

const path = require("path");
const os = require("os");

const APP_DIR = path.join(os.homedir(), "hospitalos");

module.exports = {
  apps: [
    {
      name: "hospitalos",
      script: "node_modules/.bin/next",
      args: "start -p 3000",
      cwd: APP_DIR,

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
      error_file: path.join(APP_DIR, "logs", "error.log"),
      out_file: path.join(APP_DIR, "logs", "output.log"),
      merge_logs: true,
      log_type: "json",

      kill_timeout: 5000,
      listen_timeout: 10000,
    },
  ],
};
