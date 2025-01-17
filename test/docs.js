/**
 * Copyright 2014 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var assert = require('assert');
var fs = require('fs');
var gcloud = require('../');
var glob = require('glob');
var mitm = require('mitm');
var vm = require('vm');

var util = require('../lib/common/util.js');

function runCodeInSandbox(code, sandbox) {
  vm.createContext(sandbox);
  try {
    vm.runInNewContext(code, sandbox, {
      filename: 'assert-code.vm',
      timeout: 1000
    });
  } catch(err) {
    // rethrow the error with code for context and resolving issues faster.
    throw new Error('\n' + code + '\n\n' + err.message);
  }
}

describe('documentation', function() {
  var MITM;
  var FILES;

  before(function(done) {
    // Set a global to indicate to any interested function inside of gcloud that
    // this is a sandbox environment.
    global.GCLOUD_SANDBOX_ENV = true;

    // Turn off the network so that API calls aren't actually made.
    MITM = mitm();

    var jsonGlob = 'docs/json/master/**/*.json';
    var ignore = [
      'docs/json/master/types.json'
    ];

    glob(jsonGlob, { ignore: ignore }, function(err, files) {
      assert.ifError(err);
      FILES = files;
      done();
    });
  });

  after(function() {
    delete global.GCLOUD_SANDBOX_ENV;

    // Re-enable the network.
    MITM.disable();
  });

  it('should run docs examples without errors', function() {
    this.timeout(5000);

    FILES.forEach(function(filename) {
      var fileContents = fs.readFileSync(filename, {
        encoding: 'utf8'
      });
      var fileDocBlocks;

      try {
        fileDocBlocks = JSON.parse(fileContents);
      } catch(e) {
        throw new Error([
          'Failed to parse one of the doc files (' + e.message + ')',
          'Filename: ' + filename,
          'File contents: "' + fileContents + '"'
        ].join('\n'));
      }

      var mockConsole = Object.keys(console).reduce(function(console, method) {
        console[method] = util.noop;
        return console;
      }, {});

      var sandbox = {
        gcloud: gcloud,
        require: require,
        process: process,
        console: mockConsole,
        Buffer: Buffer,
        Date: Date,
        Array: Array,
        global: global
      };

      fileDocBlocks.methods.forEach(function(method) {
        var examples = method.examples.map(function(example) {
          return example.code;
        });

        var code = examples
          .join('\n')
          .replace(/require\(\'gcloud\'\)/g, 'require(\'..\/\')')
          .replace(/require\(\'gcloud/g, 'require(\'..');

        assert.doesNotThrow(runCodeInSandbox.bind(null, code, sandbox));
      });
    });
  });
});
