
function toCharCodes(str) {
  var codes = [];
  for (var i = 0; i < str.length; i++) {
    codes.push(str.charCodeAt(i));
  }
  return codes;
}

var hostChars = toCharCodes('\r\nHost: ');
var carriageReturnCode = '\r'.charCodeAt(0);
var spaceCode = ' '.charCodeAt(0);

function BufferIndex(buffer, index) {
  this.buffer = buffer;
  this.index = index;
}

var HttpParser = exports = module.exports = function() {
  this.stage = 0;
  this.prehostBuffers = [];
  this.prehostLength = 0;
  this.hostProgress = 0;
  this.hostStart = null;
  this.host = null;
}

HttpParser.prototype.advance = function(buffer) {
  this.prehostBuffers.push(buffer);
  this.prehostLength += buffer.length;
  
  var bufferIdx = 0;
  switch(this.stage) {
  case 0:
    // Look for the beginning of the Host line.
    //
    // Note: this method only works because there are no duplicate characters in the
    // host marker.
    while (bufferIdx < buffer.length) {
      if (buffer[bufferIdx] === hostChars[this.hostProgress]) {
        this.hostProgress++;
        if (this.hostProgress == hostChars.length) {
          bufferIdx++; // Point to first character of host, not the space in ": "
          this.hostStart = new BufferIndex(this.prehostBuffers.length-1, bufferIdx);
          this.stage++;
          break;
        }
      } else if (this.hostProgress > 0) {
        this.hostProgress = buffer[bufferIdx]==hostChars[0] ? 1 : 0;
      }
      bufferIdx++;
    }
  
    if (this.stage===0) break;

  case 1:
    // Now see if we can find the \r that ends the "Host: " line.
    while (bufferIdx < buffer.length) {
      if (buffer[bufferIdx] === carriageReturnCode) {
        this.host = this.stringBetween(this.hostStart, 
          new BufferIndex(this.prehostBuffers.length-1, bufferIdx));
          this.stage++;
        break;
      }
      bufferIdx++;
    }
    break;
  }
};

HttpParser.prototype.done = function() {
  return this.stage === 2;
}

HttpParser.prototype.stringBetween = function(start, end) {
  var result = '';
  for (var b = start.buffer; b <= end.buffer; b++) {
    var buffer = this.prehostBuffers[b];
    var indexLow = b == start.buffer ? start.index : 0;
    var indexHigh = b == end.buffer ? end.index : buffer.length;
    result += buffer.slice(indexLow, indexHigh).toString();
  }
  return result;
};
