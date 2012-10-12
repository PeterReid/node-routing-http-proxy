

X-Forwarded-For
===============

The de-facto standard for reverse proxies is to add X-Forwarded-For HTTP headers to pass on the IP address that the request is actually coming from. This proxy does *not* do that. Because multiple HTTPS connections can share a TLS connection and this proxy stops parsing the TLS connection as soon as the HTTP headers pass it by, it could not do that for any requests except the first on that connection. I figure that doing it inconsistently is worse than not doing it at all.
