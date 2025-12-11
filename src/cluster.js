/**
 * PM2 Cluster Mode for Production
 * Runs multiple worker processes
 */

const cluster = require('cluster');
const os = require('os');

const numCPUs = Math.min(os.cpus().length, 4); // Max 4 workers

if (cluster.isMaster) {
  console.log(`🚀 Master ${process.pid} is running`);
  console.log(`📊 Starting ${numCPUs} workers...`);

  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  // Handle worker exit
  cluster.on('exit', (worker, code, signal) => {
    console.log(`⚠️ Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
    cluster.fork();
  });

  // Handle worker online
  cluster.on('online', (worker) => {
    console.log(`✅ Worker ${worker.process.pid} is online`);
  });

} else {
  // Workers share the TCP connection
  require('./index.js');
  console.log(`👷 Worker ${process.pid} started`);
}
