'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const { URL } = require('node:url');

const { parseArgs, USAGE } = require('./args');
const { parseUrl, performRequest } = require('./client');
const { EXIT, McurlError } = require('./errors');

const VERSION = '1.0.0';
const DEFAULT_USER_AGENT = `mcurl/${VERSION}`;

const MIME_TYPES = {
  '.bin': 'application/octet-stream',
  '.css': 'text/css',
  '.csv': 'text/csv',
  '.gif': 'image/gif',
  '.htm': 'text/html',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.webp': 'image/webp',
  '.xml': 'application/xml',
  '.zip': 'application/zip',
};

function asMcurlError(error) {
  if (error instanceof McurlError) return error;
  return new McurlError(EXIT.CONNECT_FAILED, error.message || String(error), error);
}

function findHeader(headers, name) {
  const lower = name.toLowerCase();
  return headers.find((header) => header.name.toLowerCase() === lower);
}

function setHeader(headers, name, value) {
  const existing = findHeader(headers, name);
  if (existing) {
    existing.value = value;
  } else {
    headers.push({ name, value });
  }
}

function readFileText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new McurlError(EXIT.READ_ERROR, `cannot read ${filePath}: ${error.message}`, error);
  }
}

function readFileBuffer(filePath) {
  try {
    return fs.readFileSync(filePath);
  } catch (error) {
    throw new McurlError(EXIT.READ_ERROR, `cannot read ${filePath}: ${error.message}`, error);
  }
}

function resolveDataValue(value) {
  if (!value.startsWith('@')) return value;
  return readFileText(value.slice(1)).replace(/[\r\n]/g, '');
}

function escapeFormName(value) {
  return String(value).replace(/["\r\n]/g, (character) => {
    if (character === '"') return '\\"';
    return '';
  });
}

function mimeType(filePath) {
  return MIME_TYPES[filePath.slice(filePath.lastIndexOf('.')).toLowerCase()]
    || 'application/octet-stream';
}

function buildMultipart(fields) {
  const boundary = `----mcurl-${crypto.randomBytes(16).toString('hex')}`;
  const parts = [];

  for (const field of fields) {
    const equals = field.indexOf('=');
    if (equals === -1) {
      throw new McurlError(EXIT.USAGE, `invalid form field (expected name=value): ${field}`);
    }

    const name = field.slice(0, equals);
    const value = field.slice(equals + 1);

    if (value.startsWith('@')) {
      let filePath = value.slice(1);
      let contentType = mimeType(filePath);
      const typeMarker = filePath.indexOf(';type=');

      if (typeMarker !== -1) {
        contentType = filePath.slice(typeMarker + 6).split(';')[0];
        filePath = filePath.slice(0, typeMarker);
      }

      const filename = filePath.split(/[\\/]/).pop() || 'blob';
      parts.push(Buffer.from(
        `--${boundary}\r\n`
        + `Content-Disposition: form-data; name="${escapeFormName(name)}"; filename="${escapeFormName(filename)}"\r\n`
        + `Content-Type: ${contentType}\r\n\r\n`,
      ));
      parts.push(readFileBuffer(filePath));
      parts.push(Buffer.from('\r\n'));
    } else {
      parts.push(Buffer.from(
        `--${boundary}\r\n`
        + `Content-Disposition: form-data; name="${escapeFormName(name)}"\r\n\r\n`
        + `${value}\r\n`,
      ));
    }
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function buildBody(options) {
  if (options.forms.length > 0) {
    return buildMultipart(options.forms);
  }

  if (options.json !== null) {
    return {
      body: Buffer.from(options.json, 'utf8'),
      contentType: 'application/json',
    };
  }

  if (options.dataBinary.length > 0) {
    const parts = options.dataBinary.map((value) => (
      value.startsWith('@')
        ? readFileBuffer(value.slice(1))
        : Buffer.from(value, 'utf8')
    ));
    return {
      body: Buffer.concat(parts),
      contentType: 'application/x-www-form-urlencoded',
    };
  }

  if (options.data.length > 0) {
    const text = options.data.map(resolveDataValue).join('&');
    return {
      body: Buffer.from(text, 'utf8'),
      contentType: 'application/x-www-form-urlencoded',
    };
  }

  return { body: null, contentType: null };
}

function loadCookies(value) {
  try {
    if (fs.existsSync(value) && fs.statSync(value).isFile()) {
      const cookies = [];
      for (const line of fs.readFileSync(value, 'utf8').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const columns = trimmed.split('\t');
        if (columns.length >= 7) {
          cookies.push(`${columns[5]}=${columns[6]}`);
        } else if (trimmed.includes('=')) {
          cookies.push(trimmed);
        }
      }
      return cookies.join('; ');
    }
  } catch (error) {
    return value;
  }
  return value;
}

function buildHeaderList(options, url, contentType, body) {
  const headers = [];

  setHeader(headers, 'User-Agent', options.userAgent || DEFAULT_USER_AGENT);
  setHeader(headers, 'Accept', '*/*');

  if (contentType) {
    setHeader(headers, 'Content-Type', contentType);
  }

  if (options.user) {
    const separator = options.user.indexOf(':');
    const user = separator === -1 ? options.user : options.user.slice(0, separator);
    const password = separator === -1 ? '' : options.user.slice(separator + 1);
    setHeader(
      headers,
      'Authorization',
      `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`,
    );
  } else if (url.username || url.password) {
    const user = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    setHeader(
      headers,
      'Authorization',
      `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`,
    );
    url.username = '';
    url.password = '';
  }

  if (options.cookie) {
    setHeader(headers, 'Cookie', loadCookies(options.cookie));
  }
  if (options.referer) {
    setHeader(headers, 'Referer', options.referer);
  }

  setHeader(headers, 'Host', url.host);

  if (body !== null && !findHeader(headers, 'Transfer-Encoding')) {
    setHeader(headers, 'Content-Length', String(body.length));
  }

  for (const raw of options.headers) {
    const separator = raw.indexOf(':');
    if (separator === -1) {
      if (!options.silent) {
        process.stderr.write(`mcurl: warning: header missing ':' ignored -> ${raw}\n`);
      }
      continue;
    }

    const name = raw.slice(0, separator).trim();
    const value = raw.slice(separator + 1).trim();
    if (!name) {
      if (!options.silent) {
        process.stderr.write(`mcurl: warning: empty header name ignored -> ${raw}\n`);
      }
      continue;
    }
    setHeader(headers, name, value);
  }

  return headers;
}

function remoteFileName(finalUrl) {
  const url = new URL(finalUrl);
  const segment = url.pathname.split('/').pop() || '';
  const name = decodeURIComponent(segment).replace(/[\\/]/g, '_');
  return name || 'index.html';
}

function writeStdout(data) {
  return new Promise((resolve, reject) => {
    process.stdout.write(data, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function writeResult(data, options, result) {
  let filename = null;

  if (options.output !== null) {
    filename = options.output;
  } else if (options.remoteName) {
    filename = remoteFileName(result.finalUrl);
  }

  if (filename === null || filename === '-') {
    await writeStdout(data);
    return null;
  }

  try {
    fs.writeFileSync(filename, data);
  } catch (error) {
    throw new McurlError(EXIT.WRITE_ERROR, `cannot write ${filename}: ${error.message}`, error);
  }
  return filename;
}

function statsFor(result, filename) {
  const url = new URL(result.finalUrl);
  return {
    http_code: String(result.statusCode),
    http_version: '1.1',
    time_total: result.timings.total.toFixed(6),
    time_connect: result.timings.connect.toFixed(6),
    time_namelookup: result.timings.namelookup.toFixed(6),
    time_starttransfer: result.timings.starttransfer.toFixed(6),
    size_download: String(result.body.length),
    size_header: String(Buffer.byteLength(result.headersText)),
    url_effective: result.finalUrl,
    remote_ip: result.remoteIp || '',
    content_type: result.headers['content-type'] || '',
    num_redirects: String(result.redirects),
    scheme: url.protocol.replace(':', ''),
    filename_effective: filename || '',
    exitcode: '0',
    errormsg: '',
  };
}

function renderWriteOut(format, result, filename) {
  const stats = statsFor(result, filename);

  let output = String(format).replace(/\\([nrt\\])/g, (match, character) => {
    if (character === 'n') return '\n';
    if (character === 'r') return '\r';
    if (character === 't') return '\t';
    return '\\';
  });

  output = output.replace(/%%/g, '\u0000PERCENT\u0000');
  output = output.replace(/%\{([^}]+)\}/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(stats, name) ? stats[name] : ''
  ));
  return output.replace(/\u0000PERCENT\u0000/g, '%');
}

function reportError(error, options) {
  if (options && options.silent && !options.showError) return;
  process.stderr.write(`mcurl: (${error.exitCode}) ${error.message}\n`);
}

async function main(argv) {
  let options;

  try {
    options = parseArgs(argv);
  } catch (error) {
    const failure = asMcurlError(error);
    reportError(failure, null);
    return failure.exitCode;
  }

  if (options.help) {
    await writeStdout(USAGE);
    return EXIT.OK;
  }

  if (options.version) {
    await writeStdout(`mcurl ${VERSION}\n`);
    return EXIT.OK;
  }

  try {
    const url = parseUrl(options.url);
    const { body, contentType } = buildBody(options);
    const method = options.method
      || (options.head ? 'HEAD' : (body !== null ? 'POST' : 'GET'));
    const headers = buildHeaderList(options, url, contentType, body);

    const result = await performRequest({
      url,
      method,
      headers,
      body,
      options,
    });

    if (options.fail && result.statusCode >= 400) {
      if (!options.silent || options.showError) {
        process.stderr.write(
          `mcurl: (${EXIT.HTTP_ERROR}) The requested URL returned error: ${result.statusCode}\n`,
        );
      }
      return EXIT.HTTP_ERROR;
    }

    const showHeaders = options.include || options.head;
    const output = showHeaders
      ? Buffer.concat([Buffer.from(result.headersText, 'utf8'), result.body])
      : result.body;

    const filename = await writeResult(output, options, result);

    if (options.writeOut !== null) {
      await writeStdout(renderWriteOut(options.writeOut, result, filename));
    }

    return EXIT.OK;
  } catch (error) {
    const failure = asMcurlError(error);
    reportError(failure, options);
    if (options.verbose && failure.cause && failure.cause.stack) {
      process.stderr.write(`${failure.cause.stack}\n`);
    }
    return failure.exitCode;
  }
}

module.exports = { main, VERSION };
