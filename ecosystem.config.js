module.exports = {
  apps: [
    {
      name:        "era-carwash-api",
      script:      "./api/server.js",
      cwd:         "/srv/claude-hub/projects/era-carwash",
      env_file:    "./api/.env",
      instances:   1,
      autorestart: true,
      watch:       false,
      env: {
        PORT: 5001,
        NODE_ENV: "production"
      }
    },
    {
      name:        "era-carwash-bot",
      script:      "./bot/bot.js",
      cwd:         "/srv/claude-hub/projects/era-carwash",
      env_file:    "./bot/.env",
      instances:   1,
      autorestart: true,
      watch:       false
    }
  ]
}
