var net = require('net');
var http = require('http');
var RoutingHttpProxy = require('../routing-http-proxy');

// GETting http://127.0.0.1:8000 will go to port 31415
// GETting http://127.0.0.2:8000 will go to port 27183
var router = new RoutingHttpProxy(function(host) {
  console.log('Proxying for host ' + host);
  return net.connect(host.indexOf('127.0.0.1')>=0 ? 31415 : 27183, 'localhost');
});

// Start listening for and proxying TCP connections on port 8000
var incomingServer = net.createServer(function(inputStream) {
  router.proxy(inputStream);
}).listen(8000);

// Start HTTP servers on ports 31415 an 27183
[31415, 27183].forEach(function(port) {
  http.createServer(function (req, res) {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('proxied to port ' + port + '\n');
  }).listen(port);
});
