'use strict';

const EXIT = Object.freeze({
  OK: 0,
  UNSUPPORTED_PROTOCOL: 1,
  USAGE: 2,
  URL_MALFORMAT: 3,
  HOST_NOT_FOUND: 6,
  CONNECT_FAILED: 7,
  HTTP_ERROR: 22,
  WRITE_ERROR: 23,
  READ_ERROR: 26,
  TIMEOUT: 28,
  TOO_MANY_REDIRECTS: 47,
  SSL_CERTPROBLEM: 60,
});

class McurlError extends Error {
  constructor(exitCode, message, cause) {
    super(message);
    this.name = 'McurlError';
    this.exitCode = exitCode;
    if (cause) this.cause = cause;
  }
}

module.exports = { EXIT, McurlError };
