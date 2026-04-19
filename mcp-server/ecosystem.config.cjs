module.exports = {
  apps: [
    {
      name: "skillfoundry-mcp",
      script: "./dist/server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        SKILLFOUNDRY_PORT: 9877,
        SKILLFOUNDRY_ROOT: require("path").resolve(__dirname, ".."),
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
      },
      error_file: "./logs/mcp-error.log",
      out_file: "./logs/mcp-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      max_memory_restart: "256M",
      watch: false,
      min_uptime: "10s",
      max_restarts: 10,
    },
  ],
};
