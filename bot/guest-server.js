const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const HTML_FILE = path.join(__dirname, 'guest.html');

http.createServer(function(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache'
  });
  fs.createReadStream(HTML_FILE).pipe(res);
}).listen(PORT, function() {
  console.log('Guest portal running on http://95.217.46.40:' + PORT);
});
