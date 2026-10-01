module.exports = {
  apps: [
    {
      name:        'tattooshop',
      script:      'server.js',
      cwd:         '/home/dad/www/tattooshop',
      instances:   1,
      autorestart: true,
      watch:       false,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
        PORT:     3030
      },
      error_file:  '/home/dad/logs/tattooshop/pm2-err.log',
      out_file:    '/home/dad/logs/tattooshop/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};
