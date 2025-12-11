/**
 * PM2 Ecosystem Configuration
 * Production deployment configuration for PM2
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 start ecosystem.config.js --env production
 */

module.exports = {
  apps: [
    {
      name: 'acceso-api',
      script: './src/index.js',
      instances: process.env.PM2_INSTANCES || 'max', // Use all CPU cores
      exec_mode: 'cluster',
      
      // Environment variables
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      
      // Restart policy
      watch: false,
      max_memory_restart: '1G',
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      
      // Health monitoring
      exp_backoff_restart_delay: 100,
    },
    
    // Workflow worker process
    {
      name: 'acceso-worker',
      script: './src/workers/workflow.js',
      instances: 2,
      exec_mode: 'cluster',
      
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      
      // Logging
      error_file: './logs/worker-error.log',
      out_file: './logs/worker-out.log',
      merge_logs: true,
      
      // Restart
      max_memory_restart: '500M',
      restart_delay: 5000,
    },
    
    // ZK Proof worker (dedicated process)
    {
      name: 'acceso-zk-worker',
      script: './src/workers/zk.js',
      instances: 1,
      exec_mode: 'fork',
      
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      
      // Logging
      error_file: './logs/zk-worker-error.log',
      out_file: './logs/zk-worker-out.log',
      
      // ZK proofs are CPU intensive
      max_memory_restart: '2G',
      restart_delay: 10000,
    },
  ],
  
  // Deployment configuration
  deploy: {
    production: {
      user: 'deploy',
      host: ['api.acceso.dev'],
      ref: 'origin/main',
      repo: 'git@github.com:acceso/api.git',
      path: '/var/www/api.acceso.dev',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
    },
    staging: {
      user: 'deploy',
      host: ['staging.api.acceso.dev'],
      ref: 'origin/develop',
      repo: 'git@github.com:acceso/api.git',
      path: '/var/www/staging.api.acceso.dev',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env staging',
    },
  },
};
