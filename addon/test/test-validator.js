/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

const validator = require("validator");
const httpd = require("sdk/test/httpd");

const port = 9999;
const origin = "http://localhost:" + port;
let server;

// SDK tests are run in alphabetic order, so rely on that property to
// run setup and teardown test steps
exports["test A setup"] = function (assert) {
  server = httpd.startServerAsync(port);
  server.registerPathHandler("/appcache.manifest", function handle(request, response) {
    response.write("");
  });
  assert.pass("Setup");
}

exports["test validate empty appcache"] = function(assert, done) {
  let errors = [], warnings = [];
  let manifest = {};
  let promise = validator.validateAppCache(errors, warnings, manifest, "http://mozilla.org");
  promise.then(function () {
    assert.equal(errors.length, 0, "no error");
    assert.equal(warnings.length, 0, "no warning");
    done();
  });
}

exports["test relative path"] = function(assert, done) {
  let errors = [], warnings = [];
  let manifest = {appcache_path: "appcache.manifest"};
  let promise = validator.validateAppCache(errors, warnings, manifest, origin);
  promise.then(function () {
    assert.equal(errors.length, 0, "no error for relative path");
    assert.equal(warnings.length, 0, "no warning for relative path");
    done();
  })
}

exports["test absolute path"] = function(assert, done) {
  let errors = [], warnings = [];
  let manifest = {appcache_path: "/appcache.manifest"};
  let promise = validator.validateAppCache(errors, warnings, manifest, origin);
  promise.then(function () {
    assert.equal(errors.length, 0, "still no error for absolute path");
    assert.equal(warnings.length, 0, "still no warning for absolute path");
    done();
  });
}

exports["test absolute URI"] = function(assert, done) {
  let errors = [], warnings = [];
  let manifest = {appcache_path: origin + "/appcache.manifest"};
  let promise = validator.validateAppCache(errors, warnings, manifest, origin);
  promise.then(function () {
    assert.equal(errors.length, 0, "no error for absolute URI");
    assert.equal(warnings.length, 0, "no warning for absolute URI");
    done();
  });
}

exports["test redirected"] = function(assert, done) {
  server.registerPathHandler("/redirected.manifest", function handle(request, response) {
    response.setStatusLine(request.httpVersion, 301, "Moved Permanently");
    response.setHeader("Location", origin + "/appcache.manifest", false);
  });
  let errors = [], warnings = [];
  let manifest = {appcache_path: "redirected.manifest"};
  let promise = validator.validateAppCache(errors, warnings, manifest, origin);
  promise.then(function () {
    assert.equal(errors.length, 1, "redirected manifest are ignored");
    assert.equal(
      errors[0],
      "Redirected appcache manifests are ignored. " +
      "http://localhost:9999/redirected.manifest has been redirected to " +
      "http://localhost:9999/appcache.manifest");
    assert.equal(warnings.length, 0, "no warning for absolute URI");
    done();
  });
}

exports["test nonexistent"] = function(assert, done) {
  server.registerPathHandler("/nonexistent.manifest", function handle(request, response) {
    response.setStatusLine(request.httpVersion, 404, "Not Found");
  });
  let errors = [], warnings = [];
  let manifest = {appcache_path: "nonexistent.manifest"};
  let promise = validator.validateAppCache(errors, warnings, manifest, origin);
  promise.then(function () {
    assert.equal(errors.length, 1, "nonexistent manifest are warned");
    assert.equal(
      errors[0],
      "Appcache URL (http://localhost:9999/nonexistent.manifest) returns a " +
      "404 HTTP status code and will be ignored");
    assert.equal(warnings.length, 0, "no warning for absolute URI");
    done();
  });
}

exports["test z teardown"] = function (assert, done) {
  server.stop(done);
  assert.pass("teardown");
}

require('sdk/test').run(exports);
