module.exports = {
  apps: [
    {
      name: "pista-server",
      script: "./apps/server/dist/index.js",
      instances: "max",
      exec_mode: "cluster",
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
