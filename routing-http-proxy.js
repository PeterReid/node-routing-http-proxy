var HttpParser = require('./http-parser');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

// When we get lots of data before we know what the destination host is, we have to
// buffer it. Limiting that prevents malformed data from filling up our memory.
// Note that if we find the "Host:" in the last packet, we accept the length even
// if that packet puts us over that limit.
// In practice, this is roughly how long a URI is allowed.
var PREHOST_MAX_LENGTH = 5*1024;

function httpResponse(code, message) {
  return 'HTTP/1.1 ' + code + ' ' + message + '\r\n\r\n' + message;
}
var HOST_NOT_FOUND_ERROR = httpResponse(404, "Host Not Found");
var URI_TOO_LONG_ERROR = httpResponse(414, "URI Too Long");
var TARGET_FAILED = httpResponse(502, "No Response From Inner Server");

/*
 * targetStreamCb :: host -> stream?
 *   Provide an output stream for the given request. May return null.
 *   'this' is set to the the input stream
 */
var RoutingHttpProxy = module.exports = function(targetStreamCb) {
  EventEmitter.call(this);

  this.targetStreamCb = targetStreamCb;
};
util.inherits(RoutingHttpProxy, EventEmitter)

/*
 * Proxy one HTTP stream into another.
 *
 * stream :: Stream
 *   readable stream that will send HTTP
 */
RoutingHttpProxy.prototype.proxy = function(stream) {
  stream.httpParser = new HttpParser();
  stream._routingHttpProxy = this;
  stream.on('data', onPrehostData);
  stream.on('error', function(err) {
    this.removeListener('data', onPrehostData);
    err.message = 'Error in input stream. ' + err.message;
    this.emit('error', err)
  });
}


function onPrehostData(buffer) {
  var requestorStream = this;

  this.httpParser.advance(buffer);

  if (this.httpParser.done()) {
    var targetStream = this._routingHttpProxy.targetStreamCb.call(this,
      this.httpParser.host, this.httpParser.uri);

    if (!targetStream) {
      this._routingHttpProxy.emit('error', new Error('Invalid target: ' + this.httpParser.host), this);

      requestorStream.end(HOST_NOT_FOUND_ERROR);
      return;
    }

    var gotSomeFromTarget = false;
    targetStream.on('error', function(err) {
      err.message = 'Target stream for ' + this.httpParser.host + this.httpParser.uri + ' failed. ' + err.message;
      this._routingHttpProxy.emit('error', err, this);
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

    this.emit('proxy', this.httpParser.host, this.httpParser.uri, requestorStream, targetStream);

    delete this.httpParser;

  } else {
    if (this.httpParser.prehostLength > PREHOST_MAX_LENGTH) {
      this._routingHttpProxy.emit('error', new Error('Shutting down stream for exceeding ' + PREHOST_MAX_LENGTH), this);
      requestorStream.end(URI_TOO_LONG_ERROR);
      requestorStream.removeListener('data', onPrehostData);
    }
  }
}
