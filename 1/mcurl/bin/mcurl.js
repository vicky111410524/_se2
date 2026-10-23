#!/usr/bin/env node
'use strict';

const { main } = require('../src/cli');

process.stdout.on('error', (error) => {
  if (error.code === 'EPIPE') process.exit(0);
  throw error;
});

main(process.argv.slice(2))
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    process.stderr.write(`mcurl: ${error.stack || error}\n`);
    process.exitCode = 7;
  });
