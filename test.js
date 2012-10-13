var https = require('https');
var http = require('http');
var assert = require('assert');
var tls = require('tls');
var fs = require('fs');
var net = require('net');
var proxyStream = require('./http-proxy').proxyStream;

var targetServer = http.createServer(function (req, res) {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Hello World\n');
}).listen(18082);

var targets = {
  '127.0.0.2': {
    host: '127.0.0.1',
    port: 18082
  },
  '127.0.0.3': {
    host: '127.0.0.1',
    port: 18083
  }
};

var proxyServer = tls.createServer({ // HTTPS options
  key: fs.readFileSync('./dummy.key'),
  cert: fs.readFileSync('./dummy.crt')
});
proxyServer.on('secureConnection', function(stream) {
  proxyStream(stream, function(host, uri) {
    var target = targets[host];
    if (!target) return null;
    
    return net.connect(target.port, target.host);
  });
});
proxyServer.listen(443);


var testComplete = false;

var options = {
  host: '127.0.0.2',
  port: 443,
  path: '/connect',
  method: 'GET'
};
var req = https.get(options, function(res) {
  console.log("statusCode: ", res.statusCode);
  console.log("headers: ", res.headers);

  res.on('data', function(d) {
    process.stdout.write(d);
  });
  res.on('end', function() {
    testComplete = true;
    proxyServer.close();
    targetServer.close();
  });
}).on('error', function(e) {
  console.error(e);
})
req.end();

var sockets = req.agent.sockets[options.host + ':' + options.port];
assert(sockets.length === 1);
var socket = sockets[0];
fragmentWriting(socket);

function fragmentWriting(socket) {
  socket._directWrite = socket.write;
  socket._toPump = [];
  socket._pumpIndex = 0;
  
  socket.write = function(buffer, encoding) {
    socket._toPump.push(Array.prototype.slice.apply(arguments));
    
    if (!socket._pumping) {
      setTimeout(function() {
        socket.emit('pump');
      }, 100);
      socket._pumping = true;
    }
  }
  socket.on('pump', function() {
    if (this._toPump.length === 0) {
      this._pumping = false;
      return;
    }
    
    var buffer = this._toPump[0][0];
    var encoding = this._toPump[0][1];
    var start = this._pumpIndex;
    var end = Math.min(buffer.length, start + 1 + Math.round(Math.random()*5));
    var fragment = Buffer.isBuffer(buffer) 
                   ? buffer.slice(start, end)
                   : buffer.substring(start, end);
    console.log('pumping', fragment);
    this._directWrite.call(this, fragment, encoding);
    
    if (end == buffer.length) {
      this._pumpIndex = 0;
      this._toPump.shift();
    } else {
      this._pumpIndex = end;
    }
    
    setTimeout(function() {
      socket.emit('pump');
    }, 100);
  });
}

console.log();