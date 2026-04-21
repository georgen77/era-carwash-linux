var Service = require('node-windows').Service;
var svc = new Service({
  name: 'ERA Bot',
  description: 'ERA Apartments Telegram Bot',
  script: 'C:\\era-bot\\bot.js'
});
svc.on('install', function() {
  svc.start();
  console.log('Сервис установлен и запущен!');
});
svc.install();