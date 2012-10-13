var tls = require('tls');
var fs = require('fs');
var net = require('net');

var options = { // HTTPS options
  key: fs.readFileSync(process.argv[2]),
  cert: fs.readFileSync(process.argv[3])
};

// When we get lots of data before we know what the destination host is, we have to
// buffer it. Limiting that prevents malformed data from filling up our memory.
// Note that if we find the "Host:" in the last packet, we accept the length even
// if that packet puts us over that limit.
// In practice, this is roughly how long a URI is allowed.
var PREHOST_MAX_LENGTH = 5*1024;

//todo: overwrite write()
/*
function validateTargets(ts) {
  if (typeof ts !== 'object') {
    throw new Error('Targets must be an object mapping host to {host, port}');
  }
  for (var target in ts) {
    if (typeof target.host !== 'string') {
      throw new Error('Target ' + target + ' does not have a valid host.');
    } else if (typeof target.port !== 'number' || target.port != (target.port|0)) {
      throw new Error('Target ' + target + ' does not have a valid port.');
    }
  }
  return ts;
}

var targets = {};
var readTargetsFile = function(cb) {
  return fs.readFile('./targets.json', function(err, json) {
    if (err) {
        console.error('targets.json parse failed:', e);
        cb(e);
    }

    try {
      targets = validateTargets(JSON.parse(json)));
      cb(null);
    } catch (e) {
      console.error('targets.json parse failed:', e);
      cb(e);
    }
  });
}
*/

/* Throttled console.error, since it is blocking */
var reportError = (function() {
  var windowChange;
  var inWindow = 0;
  var dropped = 0;
  return function() {
    if (!windowChange) {
      windowChange = setTimeout(function() {
        if (dropped > 0) {
          console.error(dropped + ' error messages dropped to prevent spray.');
        }
        inWindow = 0;
        dropped = 0;
        windowChange = null;
      }, 100);
    }

    inWindow++;
    if (inWindow > 5) {
      dropped++;
    } else {
      console.error.apply(console, arguments);
    }
  }
})();

var targets = {
  'localproxy.flightvector.com': {
    host: '127.0.0.1',
    port: 8082
  },
  'weather.flightvector.com': {
    host: '127.0.0.1',
    port: 3001
  },
  'proxy1.flightvector.com': {
    host: '127.0.0.1',
    port: 8082
  },
  'map.flightvector.com': {
    host: '127.0.0.1',
    port: 8083
  },
  '127.0.0.2': {
    host: '127.0.0.1',
    port: 8082
  },
  '127.0.0.3': {
    host: '127.0.0.1',
    port: 8083
  }
};

function onConnection(stream) {
  stream.prehostBuffers = [];
  stream.prehostLength = 0;
  stream.hostProgress = 0;

  stream.on('data', onPrehostData);
}

function toCharCodes(str) {
  var codes = [];
  for (var i = 0; i < str.length; i++) {
    codes.push(str.charCodeAt(i));
  }
  return codes;
}

var hostChars = toCharCodes('\r\nHost: ');
var endHostChar = '\r'.charCodeAt(0);

function stringBetween(buffers, start, end) {
  var result = '';
  for (var b = start.buffer; b <= end.buffer; b++) {
    var indexLow = b == start.buffer ? start.index : 0;
    var indexHigh = b == end.buffer ? end.index : buffers[b].length;
    result += buffers[b].slice(indexLow, indexHigh);
  }
  return result;
}

function httpResponse(code, message) {
  return 'HTTP/1.1 ' + code + ' ' + message + '\r\n\r\n' + message;
}
var HOST_NOT_FOUND_ERROR = httpResponse(404, "Host Not Found");
var URI_TOO_LONG_ERROR = httpResponse(414, "URI Too Long");
var TARGET_FAILED = httpResponse(502, "No Response From Inner Server");

function onPrehostData(buffer) {
  var requestorStream = this;

  this.prehostBuffers.push(buffer);
  this.prehostLength += buffer.length;

  var bufferIdx = 0;
  if (!this.hostStart) {
    // Look for the beginning of the Host line.
    //
    // Note: this method only works because there are no duplicate characters in the
    // host marker.
    while (bufferIdx < buffer.length) {
      if (buffer[bufferIdx] === hostChars[this.hostProgress]) {
        this.hostProgress++;
        if (this.hostProgress == hostChars.length) {
          bufferIdx++; // Point to first character of host, not the space in ": "
          this.hostStart = {
            buffer: this.prehostBuffers.length-1,
            index: bufferIdx
          }
          break;
        }
      } else if (this.hostProgress > 0) {
        this.hostProgress = buffer[bufferIdx]==hostChars[0] ? 1 : 0;
      }
      bufferIdx++;
    }
  }

  if (this.hostStart) {
    // Now see if we can find the \r that ends the "Host: " line.
    while (bufferIdx < buffer.length) {
      if (buffer[bufferIdx] == endHostChar) {
        this.hostEnd = {
          buffer: this.prehostBuffers.length-1,
          index: bufferIdx
        }
        break;
      }
      bufferIdx++;
    }
  }

  if (this.hostEnd) { // (implies this.hostStart) 
    var host = stringBetween(this.prehostBuffers, this.hostStart, this.hostEnd);
    var target = targets[host];

    if (!target) {
      reportError('Invalid target: ' + host);

      requestorStream.end(HOST_NOT_FOUND_ERROR);
      return;
    }

    var targetStream = net.connect(target.port, target.host);
    var gotSomeFromTarget = false;
    targetStream.on('error', function(err) {
      reportError('Target stream to ' + target.host + ':' + target.port + ' failed.');
      requestorStream.end(gotSomeFromTarget ? '' : TARGET_FAILED);
    });
    targetStream.once('data', function() {
      gotSomeFromTarget = true;
    });
    requestorStream.removeListener('data', onPrehostData);

    requestorStream.pipe(targetStream);
    targetStream.pipe(requestorStream);

    requestorStream.prehostBuffers.forEach(function(buffer) {
      targetStream.write(buffer);
    });
    delete requestorStream.prehostBuffers;

  } else {
    if (this.prehostLength > PREHOST_MAX_LENGTH) {
      reportError('Shutting down stream for exceeding ', PREHOST_MAX_LENGTH);
      requestorStream.end(URI_TOO_LONG_ERROR);
      requestorStream.removeListener('data', onPrehostData);
    }
  }
}

var server = tls.createServer(options);
server.on('secureConnection', onConnection);
server.listen(443);
