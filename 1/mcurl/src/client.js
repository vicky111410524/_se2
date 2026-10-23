'use strict';

const http = require('node:http');
const https = require('node:https');
const { performance } = require('node:perf_hooks');
const { URL } = require('node:url');

const { EXIT, McurlError } = require('./errors');

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
const CONTENT_HEADERS = new Set(['content-length', 'content-type', 'transfer-encoding']);

function parseUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch (error) {
    throw new McurlError(EXIT.URL_MALFORMAT, `URL malformed: ${raw}`, error);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new McurlError(
      EXIT.UNSUPPORTED_PROTOCOL,
      `unsupported protocol: ${url.protocol.replace(':', '')}`,
    );
  }

  return url;
}

function headersToObject(headers) {
  const object = {};
  for (const header of headers) {
    object[header.name] = header.value;
  }
  return object;
}

function requestPath(url) {
  return `${url.pathname || '/'}${url.search}`;
}

function formatResponseHeaders(response) {
  let text = `HTTP/1.1 ${response.statusCode} ${response.statusMessage || ''}\r\n`;
  const raw = response.rawHeaders;
  for (let index = 0; index < raw.length; index += 2) {
    text += `${raw[index]}: ${raw[index + 1]}\r\n`;
  }
  return `${text}\r\n`;
}

function logRequest(method, url, headers, body) {
  process.stderr.write(`> ${method} ${requestPath(url)} HTTP/1.1\n`);
  for (const header of headers) {
    process.stderr.write(`> ${header.name}: ${header.value}\n`);
  }
  process.stderr.write('>\n');
  if (body) {
    process.stderr.write(`> [${body.length} bytes of body data]\n`);
  }
}

function logResponse(response) {
  process.stderr.write(
    `< HTTP/1.1 ${response.statusCode} ${response.statusMessage || ''}\n`,
  );
  const raw = response.rawHeaders;
  for (let index = 0; index < raw.length; index += 2) {
    process.stderr.write(`< ${raw[index]}: ${raw[index + 1]}\n`);
  }
  process.stderr.write('<\n');
}

function mapNodeError(error) {
  if (error instanceof McurlError) return error;

  const code = error && error.code;
  const detail = error && error.message ? error.message : String(error);

  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    const host = error.hostname ? `: ${error.hostname}` : '';
    return new McurlError(EXIT.HOST_NOT_FOUND, `could not resolve host${host}`, error);
  }
  if (code === 'ETIMEDOUT') {
    return new McurlError(EXIT.TIMEOUT, 'operation timed out', error);
  }
  if (code === 'ECONNREFUSED') {
    const target = error.address ? ` ${error.address}:${error.port}` : '';
    return new McurlError(EXIT.CONNECT_FAILED, `failed to connect${target}`, error);
  }
  if (code === 'ECONNRESET' || code === 'EPIPE') {
    return new McurlError(EXIT.CONNECT_FAILED, 'connection reset by peer', error);
  }
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH' || code === 'EADDRNOTAVAIL') {
    return new McurlError(EXIT.CONNECT_FAILED, 'could not reach the remote host', error);
  }
  if (
    code === 'EPROTO'
    || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
    || (typeof code === 'string' && (code.startsWith('ERR_TLS') || code.includes('CERT')))
  ) {
    return new McurlError(EXIT.SSL_CERTPROBLEM, `TLS certificate problem: ${detail}`, error);
  }

  return new McurlError(EXIT.CONNECT_FAILED, detail, error);
}

function doRequest(target, method, headers, body, options) {
  return new Promise((resolve, reject) => {
    const transport = target.protocol === 'https:' ? https : http;
    const start = performance.now();
    const timings = {};

    let settled = false;
    let timedOut = false;
    let maxTimer = null;
    let connectTimer = null;

    const cleanup = () => {
      if (maxTimer) {
        clearTimeout(maxTimer);
        maxTimer = null;
      }
      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = null;
      }
    };

    const timeoutError = () => new McurlError(EXIT.TIMEOUT, 'operation timed out');

    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const resolveOnce = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const requestOptions = {
      method,
      headers: headersToObject(headers),
      agent: false,
      rejectUnauthorized: !options.insecure,
    };

    let request;
    try {
      request = transport.request(target, requestOptions);
    } catch (error) {
      rejectOnce(mapNodeError(error));
      return;
    }

    if (options.maxTime && options.maxTime > 0) {
      maxTimer = setTimeout(() => {
        timedOut = true;
        request.destroy(new Error('operation timed out'));
      }, options.maxTime * 1000);
    }

    if (options.connectTimeout && options.connectTimeout > 0) {
      connectTimer = setTimeout(() => {
        timedOut = true;
        request.destroy(new Error('connect timeout'));
      }, options.connectTimeout * 1000);
    }

    request.on('socket', (socket) => {
      if (!socket.connecting) {
        if (connectTimer) {
          clearTimeout(connectTimer);
          connectTimer = null;
        }
        if (timings.namelookup === undefined) {
          timings.namelookup = performance.now() - start;
        }
        if (timings.connect === undefined) {
          timings.connect = performance.now() - start;
        }
        return;
      }

      socket.once('lookup', () => {
        if (timings.namelookup === undefined) {
          timings.namelookup = performance.now() - start;
        }
      });
      socket.once('connect', () => {
        if (timings.connect === undefined) {
          timings.connect = performance.now() - start;
        }
        if (connectTimer) {
          clearTimeout(connectTimer);
          connectTimer = null;
        }
      });
    });

    request.on('error', (error) => {
      rejectOnce(timedOut ? timeoutError() : mapNodeError(error));
    });

    request.on('response', (response) => {
      timings.starttransfer = performance.now() - start;
      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = null;
      }

      if (options.verbose) logResponse(response);

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('aborted', () => {
        rejectOnce(timedOut ? timeoutError()
          : new McurlError(EXIT.CONNECT_FAILED, 'connection aborted by peer'));
      });
      response.on('error', (error) => {
        rejectOnce(timedOut ? timeoutError() : mapNodeError(error));
      });
      response.on('end', () => {
        resolveOnce({
          statusCode: response.statusCode,
          statusMessage: response.statusMessage || '',
          headers: response.headers,
          headerBlock: formatResponseHeaders(response),
          body: Buffer.concat(chunks),
          url: target,
          timings: { ...timings, total: performance.now() - start },
          remoteIp: request.socket && request.socket.remoteAddress
            ? request.socket.remoteAddress
            : '',
        });
      });
    });

    if (body) request.write(body);
    request.end();
  });
}

async function performRequest({ url, method, headers, body, options }) {
  const overallStart = performance.now();
  const deadline = options.maxTime && options.maxTime > 0
    ? overallStart + (options.maxTime * 1000)
    : null;
  let currentUrl = parseUrl(url);
  let currentMethod = method;
  let currentBody = body;
  let currentHeaders = headers.map((header) => ({ ...header }));
  let redirects = 0;
  let lastResponse = null;
  const responseBlocks = [];
  const totals = {};

  for (;;) {
    if (options.verbose) {
      logRequest(currentMethod, currentUrl, currentHeaders, currentBody);
    }

    let requestOptions = options;
    if (deadline !== null) {
      const remainingMs = deadline - performance.now();
      if (remainingMs <= 0) {
        throw new McurlError(EXIT.TIMEOUT, 'operation timed out');
      }
      requestOptions = { ...options, maxTime: remainingMs / 1000 };
    }

    const response = await doRequest(
      currentUrl,
      currentMethod,
      currentHeaders,
      currentBody,
      requestOptions,
    );

    lastResponse = response;
    responseBlocks.push(response.headerBlock);

    if (totals.namelookup === undefined) totals.namelookup = response.timings.namelookup;
    if (totals.connect === undefined) totals.connect = response.timings.connect;
    if (totals.starttransfer === undefined) totals.starttransfer = response.timings.starttransfer;

    const isRedirect = REDIRECT_CODES.has(response.statusCode);
    if (options.location && isRedirect && response.headers.location) {
      if (redirects >= options.maxRedirs) {
        throw new McurlError(
          EXIT.TOO_MANY_REDIRECTS,
          `too many redirects (> ${options.maxRedirs})`,
        );
      }

      redirects += 1;

      const previousHost = currentUrl.host;
      let nextUrl;
      try {
        nextUrl = new URL(response.headers.location, currentUrl);
      } catch (error) {
        throw new McurlError(
          EXIT.URL_MALFORMAT,
          `redirect location is malformed: ${response.headers.location}`,
          error,
        );
      }
      currentUrl = parseUrl(nextUrl.toString());

      const hostHeader = currentHeaders.find(
        (header) => header.name.toLowerCase() === 'host',
      );
      if (hostHeader) hostHeader.value = currentUrl.host;

      if (currentUrl.host !== previousHost) {
        currentHeaders = currentHeaders.filter(
          (header) => header.name.toLowerCase() !== 'authorization',
        );
      }

      if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 303) {
        currentMethod = 'GET';
        currentBody = null;
        currentHeaders = currentHeaders.filter(
          (header) => !CONTENT_HEADERS.has(header.name.toLowerCase()),
        );
      }
      continue;
    }

    break;
  }

  const totalMs = performance.now() - overallStart;

  return {
    ...lastResponse,
    headersText: responseBlocks.join(''),
    finalUrl: currentUrl.toString(),
    redirects,
    timings: {
      namelookup: (totals.namelookup || 0) / 1000,
      connect: (totals.connect || 0) / 1000,
      starttransfer: (totals.starttransfer || 0) / 1000,
      total: totalMs / 1000,
    },
  };
}

module.exports = { parseUrl, performRequest };
