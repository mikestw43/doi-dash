// PM2 Ecosystem Config — started by deploy/setup.sh:
//   pm2 start /opt/doi-dash/deploy/ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'doi-dash-api',
      script: './dist/index.js',
      // cwd matters: dotenv reads backend/.env and Prisma resolves the
      // SQLite file relative to this directory.
      cwd: '/opt/doi-dash/backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      error_file: '/opt/doi-dash/logs/api-error.log',
      out_file: '/opt/doi-dash/logs/api-out.log',
      time: true,
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
    },
  ],
};
