*Disclaimer:* Before you use this, consider using https://github.com/nodejitsu/node-http-proxy instead. It is more featureful and battle-tested. It seems to work for a lot of people. It didn't work for me, unfortunately, so I set out to make this. (I was getting an intermittent ECONNRESET from an otherwise happy process, running on the same machine, that I was proxying to, and that process would not get a connect event at all. I was probably just doing it wrong, but I don't know how and didn't have time to figure it out. If you're in the same boat, carry on.) 

This module has two goals:
- Reverse proxy from HTTP(S) to HTTP, dispatching based only on host name.
- Be fast.

This module's design has one drawback (for some): It is an anonymising proxy. You *will not* get the IP address of the requestor downstream from this. See the X-Forwarded-For section.

This proxy just barely pokes into HTTP-land to read the Host field of the HTTP header otherwise just pipes TLS/TCP to TCP and gets out of the way. Node's HTTP parser is not used.

Websockets just work because this leaves the underlying stream alone entirely.

X-Forwarded-For
===============

The de-facto standard for reverse proxies is to add X-Forwarded-For HTTP headers to pass on the IP address that the request is actually coming from. This proxy does *not* do that. Because multiple HTTPS connections can share a TLS connection and this proxy stops parsing the TLS connection as soon as the HTTP headers pass it by, it could not do that for any requests except the first on that connection. I figure that doing it inconsistently is worse than not doing it at all. 

If you want to collect IP logs with this, you will have to either log the IP and first bytes of the HTTP request at the proxy, or send IP information out-of-band somehow. 
