'use strict';

const { EXIT, McurlError } = require('./errors');

const USAGE = `Usage: mcurl [options...] <url>

Transfer a URL. A small curl clone with no third-party dependencies.

Options:
  -X, --request <method>        HTTP method (GET, POST, PUT, DELETE, HEAD, ...)
  -H, --header <header>         Extra request header, e.g. "X-Key: value" (repeatable)
  -d, --data <data>             Form body; repeatable, joined with "&" (implies POST)
      --data-binary <data>      Raw body; use @file to read from a file
  -j, --json <json>             JSON body (implies POST)
  -F, --form <name=value>       multipart/form-data field; use name=@file to upload
  -A, --user-agent <string>     User-Agent header
  -u, --user <user:pass>        HTTP Basic authentication
  -b, --cookie <string|file>    Send cookies from a string or Netscape cookie file
  -e, --referer <url>           Referer header
  -o, --output <file>           Write body to file instead of stdout ("-" = stdout)
  -O, --remote-name             Write body to a file named after the URL
  -i, --include                 Include response headers in the output
  -I, --head                    Send a HEAD request and show response headers
  -L, --location                Follow 3xx redirects
      --max-redirs <num>        Maximum number of redirects (default: 50)
  -m, --max-time <seconds>      Maximum time for the whole transfer
      --connect-timeout <sec>   Maximum time to establish a connection (default: 10)
  -k, --insecure                Skip TLS certificate verification
  -f, --fail                    Exit 22 on HTTP status >= 400 and hide the body
  -s, --silent                  Do not show error messages
  -S, --show-error              Show error messages even with --silent
  -v, --verbose                 Show request/response details on stderr
  -w, --write-out <format>      Print transfer statistics after the body
  -h, --help                    Show this help
  -V, --version                 Show the version

Exit codes:
  0 ok, 1 unsupported protocol, 2 usage error, 3 malformed URL,
  6 host not found, 7 connection failed, 22 HTTP error (with -f),
  28 timeout, 47 too many redirects, 60 TLS certificate problem.
`;

const VALUE_OPTIONS = new Map([
  ['-X', 'method'], ['--request', 'method'],
  ['-H', 'header'], ['--header', 'header'],
  ['-d', 'data'], ['--data', 'data'], ['--data-raw', 'data'],
  ['--data-binary', 'dataBinary'],
  ['-j', 'json'], ['--json', 'json'],
  ['-F', 'form'], ['--form', 'form'],
  ['-A', 'userAgent'], ['--user-agent', 'userAgent'],
  ['-u', 'user'], ['--user', 'user'],
  ['-b', 'cookie'], ['--cookie', 'cookie'],
  ['-e', 'referer'], ['--referer', 'referer'],
  ['-o', 'output'], ['--output', 'output'],
  ['-m', 'maxTime'], ['--max-time', 'maxTime'],
  ['--connect-timeout', 'connectTimeout'],
  ['--max-redirs', 'maxRedirs'],
  ['-w', 'writeOut'], ['--write-out', 'writeOut'],
]);

const FLAG_OPTIONS = new Map([
  ['-O', 'remoteName'], ['--remote-name', 'remoteName'],
  ['-i', 'include'], ['--include', 'include'],
  ['-I', 'head'], ['--head', 'head'],
  ['-L', 'location'], ['--location', 'location'],
  ['-k', 'insecure'], ['--insecure', 'insecure'],
  ['-f', 'fail'], ['--fail', 'fail'],
  ['-s', 'silent'], ['--silent', 'silent'],
  ['-S', 'showError'], ['--show-error', 'showError'],
  ['-v', 'verbose'], ['--verbose', 'verbose'],
  ['-h', 'help'], ['--help', 'help'],
  ['-V', 'version'], ['--version', 'version'],
]);

function defaultOptions() {
  return {
    method: null,
    headers: [],
    data: [],
    dataBinary: [],
    json: null,
    forms: [],
    userAgent: null,
    user: null,
    cookie: null,
    referer: null,
    output: null,
    remoteName: false,
    include: false,
    head: false,
    location: false,
    maxRedirs: 50,
    maxTime: null,
    connectTimeout: 10,
    insecure: false,
    fail: false,
    silent: false,
    showError: false,
    verbose: false,
    writeOut: null,
    help: false,
    version: false,
    url: null,
  };
}

function parseSeconds(value, option) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new McurlError(EXIT.USAGE, `invalid value for ${option}: ${value}`);
  }
  return number;
}

function parseInteger(value, option) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new McurlError(EXIT.USAGE, `invalid value for ${option}: ${value}`);
  }
  return number;
}

function setValue(options, key, value) {
  switch (key) {
    case 'header':
      options.headers.push(value);
      break;
    case 'data':
      options.data.push(value);
      break;
    case 'dataBinary':
      options.dataBinary.push(value);
      break;
    case 'form':
      options.forms.push(value);
      break;
    case 'method':
      options.method = String(value).toUpperCase();
      break;
    case 'maxTime':
      options.maxTime = parseSeconds(value, '--max-time');
      break;
    case 'connectTimeout':
      options.connectTimeout = parseSeconds(value, '--connect-timeout');
      break;
    case 'maxRedirs':
      options.maxRedirs = parseInteger(value, '--max-redirs');
      break;
    default:
      options[key] = value;
  }
}

function parseArgs(argv) {
  const options = defaultOptions();
  const urls = [];
  let index = 0;

  while (index < argv.length) {
    const arg = argv[index++];

    if (arg === '--') {
      urls.push(...argv.slice(index));
      break;
    }

    if (arg === '-' || !arg.startsWith('-')) {
      urls.push(arg);
      continue;
    }

    if (arg.startsWith('--')) {
      const equals = arg.indexOf('=');
      const name = equals === -1 ? arg : arg.slice(0, equals);
      const inlineValue = equals === -1 ? undefined : arg.slice(equals + 1);

      if (VALUE_OPTIONS.has(name)) {
        let value = inlineValue;
        if (value === undefined) {
          value = argv[index++];
          if (value === undefined) {
            throw new McurlError(EXIT.USAGE, `option ${name} requires a value`);
          }
        }
        setValue(options, VALUE_OPTIONS.get(name), value);
      } else if (FLAG_OPTIONS.has(name)) {
        if (inlineValue !== undefined) {
          throw new McurlError(EXIT.USAGE, `option ${name} does not take a value`);
        }
        options[FLAG_OPTIONS.get(name)] = true;
      } else {
        throw new McurlError(EXIT.USAGE, `unknown option: ${name}`);
      }
      continue;
    }

    for (let position = 1; position < arg.length; position += 1) {
      const shortName = '-' + arg[position];
      if (VALUE_OPTIONS.has(shortName)) {
        let value = arg.slice(position + 1);
        if (value === '') {
          value = argv[index++];
          if (value === undefined) {
            throw new McurlError(EXIT.USAGE, `option ${shortName} requires a value`);
          }
        }
        setValue(options, VALUE_OPTIONS.get(shortName), value);
        break;
      } else if (FLAG_OPTIONS.has(shortName)) {
        options[FLAG_OPTIONS.get(shortName)] = true;
      } else {
        throw new McurlError(EXIT.USAGE, `unknown option: ${shortName}`);
      }
    }
  }

  if (options.help || options.version) return options;

  if (urls.length === 0) {
    throw new McurlError(EXIT.USAGE, 'no URL specified');
  }
  if (urls.length > 1) {
    throw new McurlError(EXIT.USAGE, 'only one URL can be requested at a time');
  }

  options.url = urls[0];
  return options;
}

module.exports = { parseArgs, USAGE };
