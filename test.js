var https = require('https');
var assert = require('assert');

var options = {
  host: 'localproxy.flightvector.com',
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
}).on('error', function(e) {
  console.error(e);
});

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