module.exports = {
  apps: [
    {
      name: 'banking-api',
      script: 'server.js',
      instances: parseInt(process.env.PM2_INSTANCES) || 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 5000,
      },
      max_memory_restart: process.env.PM2_MAX_MEMORY || '512M',
      error_file: process.env.PM2_LOG_DIR ? `${process.env.PM2_LOG_DIR}/api-error.log` : undefined,
      out_file: process.env.PM2_LOG_DIR ? `${process.env.PM2_LOG_DIR}/api-out.log` : undefined,
      merge_logs: true,
      max_restarts: 10,
      restart_delay: 5000,
      listen_timeout: 10000,
      kill_timeout: 5000,
    },
    {
      name: 'banking-worker',
      script: 'services/worker.js',
      instances: parseInt(process.env.WORKER_INSTANCES) || 2,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      env_development: {
        NODE_ENV: 'development',
      },
      max_memory_restart: process.env.WORKER_MAX_MEMORY || '512M',
      error_file: process.env.PM2_LOG_DIR ? `${process.env.PM2_LOG_DIR}/worker-error.log` : undefined,
      out_file: process.env.PM2_LOG_DIR ? `${process.env.PM2_LOG_DIR}/worker-out.log` : undefined,
      merge_logs: true,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};
