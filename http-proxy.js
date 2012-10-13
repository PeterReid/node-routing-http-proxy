var HttpParser = require('./http-parser');

// When we get lots of data before we know what the destination host is, we have to
// buffer it. Limiting that prevents malformed data from filling up our memory.
// Note that if we find the "Host:" in the last packet, we accept the length even
// if that packet puts us over that limit.
// In practice, this is roughly how long a URI is allowed.
var PREHOST_MAX_LENGTH = 5*1024;

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


function httpResponse(code, message) {
  return 'HTTP/1.1 ' + code + ' ' + message + '\r\n\r\n' + message;
}
var HOST_NOT_FOUND_ERROR = httpResponse(404, "Host Not Found");
var URI_TOO_LONG_ERROR = httpResponse(414, "URI Too Long");
var TARGET_FAILED = httpResponse(502, "No Response From Inner Server");

function onPrehostData(buffer) {
  var requestorStream = this;

  this.httpParser.advance(buffer);
  
  if (this.httpParser.done()) {
    var targetStream = this._targetCb.call(this,
      this.httpParser.host, this.httpParser.uri);
    
    if (!targetStream) {
      reportError('Invalid target: ' + this.httpParser.host);

      requestorStream.end(HOST_NOT_FOUND_ERROR);
      return;
    }

    var gotSomeFromTarget = false;
    targetStream.on('error', function(err) {
      reportError('Target stream for ' + this.httpParser.host + this.httpParser.uri + ' failed.');
      requestorStream.end(gotSomeFromTarget ? '' : TARGET_FAILED);
    });
    targetStream.once('data', function() {
      gotSomeFromTarget = true;
    });
    requestorStream.removeListener('data', onPrehostData);

    requestorStream.pipe(targetStream);
    targetStream.pipe(requestorStream);

    this.httpParser.prehostBuffers.forEach(function(buffer) {
      targetStream.write(buffer);
    });
    delete this.httpParser;

  } else {
    if (this.httpParser.prehostLength > PREHOST_MAX_LENGTH) {
      reportError('Shutting down stream for exceeding ', PREHOST_MAX_LENGTH);
      requestorStream.end(URI_TOO_LONG_ERROR);
      requestorStream.removeListener('data', onPrehostData);
    }
  }
}

/*
 * Proxy one HTTP stream into another.
 * 
 * stream :: Stream
 *   readable stream that will send HTTP
 * targetCb :: (host, uri) -> stream?
 *   Provide an output stream for the given request. May return null.
 *   'this' is set to the the input stream
 */
var proxyStream = module.exports.proxyStream = function(stream, targetCb) {
  stream.httpParser = new HttpParser();
  stream._targetCb = targetCb;
  stream.on('data', onPrehostData);
}

