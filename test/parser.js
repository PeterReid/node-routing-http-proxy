var assert = require('assert');
var crypto = require('crypto');
var HttpParser = require('../http-parser');

var expects = [
  {input: new Buffer(
    'GET /Protocols/rfc2616/rfc2616-sec10.html HTTP/1.1\r\n' +
    'Host: www.w3.org\r\n' +
    'Connection: keep-alive\r\n' +
    'User-Agent: Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.4 (KHTML, like Gecko) Chrome/22.0.1229.94 Safari/537.4\r\n' +
    'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8\r\n' + +
    'Accept-Encoding: gzip,deflate,sdch\r\n' +
    'Accept-Language: en-US,en;q=0.8\r\n' +
    'Accept-Charset: ISO-8859-1,utf-8;q=0.7,*;q=0.3\r\n' +
    'If-None-Match: "84d1-3e3073913b100"\r\n' +
    'If-Modified-Since: Wed, 01 Sep 2004 13:24:52 GMT\r\n' +
    '\r\n', 'ascii'),
   host: 'www.w3.org'},

  {input: /* from wireshark */ new Buffer('474554202f20485454502f312e310d0a486f73743a206e6f64656a732e6f72670d0a436f6e6e656374696f6e3a206b6565702d616c6976650d0a557365722d4167656e743a204d6f7a696c6c612f352e30202857696e646f7773204e5420362e313b20574f57363429204170706c655765624b69742f3533372e3420284b48544d4c2c206c696b65204765636b6f29204368726f6d652f32322e302e313232392e3934205361666172692f3533372e340d0a4163636570743a20746578742f68746d6c2c6170706c69636174696f6e2f7868746d6c2b786d6c2c6170706c69636174696f6e2f786d6c3b713d302e392c2a2f2a3b713d302e380d0a4163636570742d456e636f64696e673a20677a69702c6465666c6174652c736463680d0a4163636570742d4c616e67756167653a20656e2d55532c656e3b713d302e380d0a4163636570742d436861727365743a2049534f2d383835392d312c7574662d383b713d302e372c2a3b713d302e330d0a436f6f6b69653a205f5f7163613d50302d313130343538373932342d313333323038353433323938353b205f5f75746d613d312e3732333337343333352e313334383933303437372e313334383933303437372e313334383933303437372e313b205f5f75746d7a3d312e313334383933303437372e312e312e75746d6373723d6e6577732e79636f6d62696e61746f722e636f6d7c75746d63636e3d28726566657272616c297c75746d636d643d726566657272616c7c75746d6363743d2f3b205f5f75746d613d3231323231313333392e323031343232353738312e313332383939343734352e313335303039333937342e313335303039393335352e34343b205f5f75746d633d3231323231313333393b205f5f75746d7a3d3231323231313333392e313335303039333937342e34332e32372e75746d6373723d676f6f676c657c75746d63636e3d286f7267616e6963297c75746d636d643d6f7267616e69637c75746d6374723d286e6f7425323070726f7669646564290d0a49662d4d6f6469666965642d53696e63653a205361742c203133204f637420323031322030333a34353a303120474d540d0a0d0a', 'hex'),
   host: 'nodejs.org'},

  // a POST
  {input: /* from wireshark */ new Buffer('504f5354202f666f726d732f736f6d652d72656c61746976652d75726c20485454502f312e310d0a486f73743a20617070732e636f7265736572766c6574732e636f6d0d0a436f6e6e656374696f6e3a206b6565702d616c6976650d0a436f6e74656e742d4c656e6774683a2032390d0a43616368652d436f6e74726f6c3a206d61782d6167653d300d0a4f726967696e3a20687474703a2f2f617070732e636f7265736572766c6574732e636f6d0d0a557365722d4167656e743a204d6f7a696c6c612f342e302028636f6d70617469626c653b204d53494520372e303b2057696e646f7773204e5420362e30290d0a436f6e74656e742d547970653a206170706c69636174696f6e2f782d7777772d666f726d2d75726c656e636f6465640d0a4163636570743a20746578742f68746d6c2c6170706c69636174696f6e2f7868746d6c2b786d6c2c6170706c69636174696f6e2f786d6c3b713d302e392c2a2f2a3b713d302e380d0a526566657265723a20687474703a2f2f617070732e636f7265736572766c6574732e636f6d2f666f726d732f706f73742d666f726d2e68746d6c0d0a4163636570742d456e636f64696e673a20677a69702c6465666c6174652c736463680d0a4163636570742d4c616e67756167653a20656e2d55532c656e3b713d302e380d0a4163636570742d436861727365743a2049534f2d383835392d312c7574662d383b713d302e372c2a3b713d302e330d0a0d0a', 'hex'),
   host: 'apps.coreservlets.com'},

  // Malicious-ish
  {input: new Buffer(
    'GET /Protocols/rfc2616/rfc2616-sec10.html HTTP/1.1\r\n' +
    'Host: www.w3.org\r\n' +
    'User-Agent: Host: a.cunnin.ruse.com\r\n' +
    '\r\n', 'ascii'),
   host: 'www.w3.org'},

  // Multiple Host fields (not legal HTTP, but make sure we ignore the second)
  {input: new Buffer(
    'GET /Protocols/rfc2616/rfc2616-sec10.html HTTP/1.1\r\n' +
    'Host: www.w3.org\r\n' +
    'Host: www.w4.org\r\n' +
    '\r\n', 'ascii'),
   host: 'www.w3.org'}

   ];



var fragmentations = [
  function whole(buffer) {
    return [buffer];
  },

  function byBytes(buffer) {
    var result = [];
    for (var i = 0; i < buffer.length; i++) {
      result.push(new Buffer([buffer[i]]));
    }
    return result;
  },

  function randomSplit(buffer) {
    var result = [];
    var start = 0;
    while (start < buffer.length) {
      var step = Math.round(Math.random()*5)+1;
      var end = Math.min(buffer.length, start+step);
      result.push(buffer.slice(start, end));
      start = end;
    }
    return result;
  }
];

function applyFragmentation(fragmenter, parser, buffer) {
  var chunks = fragmenter(buffer);
  chunks.forEach(function(chunk) {
    if (!parser.done()) {
      parser.advance(chunk);
    }
  });
}

expects.forEach(function(expect) {
  fragmentations.forEach(function(fragmentation) {
    var parser = new HttpParser();
    assert.ok(!parser.done());

    applyFragmentation(fragmentation, parser, expect.input);

    assert.ok(parser.done());
    assert.equal(parser.host, expect.host);
  });
});

// Throw randomness at it and make sure it doesn't crash
var FUZZ_TRIALS = 1000;
crypto.randomBytes(10000, function(err, bytes) {
  if (err) throw err;

  for (var trial = 0; trial < FUZZ_TRIALS; trial++) {
    var start = Math.floor(Math.random() * bytes.length);
    var end = Math.min(bytes.length, start + Math.floor(Math.random()*512));
    fragmentations.forEach(function(fragmentation) {
      applyFragmentation(fragmentation, new HttpParser(), bytes.slice(start, end));
    });
  }
});
