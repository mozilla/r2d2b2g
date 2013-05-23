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

exports["test relative appcache path"] = function(assert, done) {
  let errors = [], warnings = [];
  let manifest = {appcache_path: "appcache.manifest"};
  let promise = validator.validateAppCache(errors, warnings, manifest, origin);
  promise.then(function () {
    assert.equal(errors.length, 0, "no error for relative path");
    assert.equal(warnings.length, 0, "no warning for relative path");
    done();
  })
}

exports["test absolute appcache path"] = function(assert, done) {
  let errors = [], warnings = [];
  let manifest = {appcache_path: "/appcache.manifest"};
  let promise = validator.validateAppCache(errors, warnings, manifest, origin);
  promise.then(function () {
    assert.equal(errors.length, 0, "still no error for absolute path");
    assert.equal(warnings.length, 0, "still no warning for absolute path");
    done();
  });
}

exports["test absolute apccache URI"] = function(assert, done) {
  let errors = [], warnings = [];
  let manifest = {appcache_path: origin + "/appcache.manifest"};
  let promise = validator.validateAppCache(errors, warnings, manifest, origin);
  promise.then(function () {
    assert.equal(errors.length, 0, "no error for absolute URI");
    assert.equal(warnings.length, 0, "no warning for absolute URI");
    done();
  });
}

exports["test redirected appcache"] = function(assert, done) {
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

exports["test nonexistent appcache"] = function(assert, done) {
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

exports["test empty manifest"] = function(assert) {
  let errors = [], warnings = [];
  let manifest = {}, app = {};
  validator.validateNameIcons(errors, warnings, manifest, app);
  assert.equal(errors.length, 1, "missing name in manifest is an error");
  assert.equal(errors[0], "Missing mandatory 'name' in Manifest.");
  assert.equal(warnings.length, 1, "missing icons in manifest causes a warning");
  assert.equal(warnings[0], "Missing 'icons' in Manifest.");
}

exports["test biggest icon selection"] = function(assert) {
  let errors = [], warnings = [];
  let manifest = {
    name: "foo",
    icons: {"16": "16.png", "128": "128.png", "32": "32.png"}
  };
  let app = {};
  validator.validateNameIcons(errors, warnings, manifest, app);
  assert.equal(errors.length, 0);
  assert.equal(warnings.length, 0);
  assert.equal(app.name, "foo", "app.name has been set");
  assert.equal(app.icon, "128.png", "selected the biggest icon");
}

exports["test marketplace icon size condition"] = function(assert) {
  let errors = [], warnings = [];
  let manifest = {
    name: "foo",
    icons: {"16": "16.png"}
  };
  let app = {};
  validator.validateNameIcons(errors, warnings, manifest, app);
  assert.equal(errors.length, 0);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0], "app submission to the Marketplace needs at least an 128 icon");
}

exports["test privileged hosted"] = function(assert) {
  let errors = [], warnings = [];
  let manifest = {
    type: "privileged"
  };
  let app = {
    type: "hosted"
  };
  validator.validateType(errors, warnings, manifest, app);
  assert.equal(errors.length, 1);
  assert.equal(errors[0], "Hosted App can't be type 'privileged'.");
}

exports["test unknown type"] = function(assert) {
  let errors = [], warnings = [];
  let manifest = {
    type: "privilegeddd"
  };
  let app = {};
  validator.validateType(errors, warnings, manifest, app);
  assert.equal(errors.length, 1);
  assert.equal(errors[0], "Unknown app type: 'privilegeddd'.");
}

exports["test certified warning"] = function(assert) {
  let errors = [], warnings = [];
  let manifest = {
    type: "certified"
  };
  let app = {
    type: "packaged"
  };
  validator.validateType(errors, warnings, manifest, app);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0], "'certified' apps are not fully supported on the Simulator.");
}

exports["test simulator unsupported permission"] = function(assert) {
  let errors = [], warnings = [];
  let manifest = {
    permissions: {sms : {}}
  };
  let app = {};
  validator.validatePermissions(errors, warnings, manifest, app);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0], "WebAPI 'WebSMS' is not currently supported on the Simulator");
}

exports["test certified only permission - accepted"] = function(assert) {
  let errors = [], warnings = [];
  let manifest = {
    permissions: {mobileconnection : {}},
    type: "certified"
  };
  let app = {};
  validator.validatePermissions(errors, warnings, manifest, app);
  assert.equal(errors.length, 0);
  assert.equal(warnings.length, 0);
}

exports["test certified only permission - denied"] = function(assert) {
  let errors = [], warnings = [];
  let manifest = {
    permissions: {mobileconnection : {}}
  };
  let app = {};
  validator.validatePermissions(errors, warnings, manifest, app);
  assert.equal(errors.length, 1);
  assert.equal(errors[0], "Denied permission 'mobileconnection' for app type 'web'.");
}

exports["test permission access"] = function(assert) {
  let errors = [], warnings = [];
  let manifest = {
    permissions: {"device-storage:videos" : {access: "readonly"}},
    type: "privileged"
  };
  let app = {};
  validator.validatePermissions(errors, warnings, manifest, app);
  assert.equal(errors.length, 0);
  assert.equal(warnings.length, 0);
}

exports["test permission wrong access"] = function(assert) {
  // Typo in access
  let errors = [], warnings = [];
  let manifest = {
    permissions: {"device-storage:videos" : {access: "readonlyyy"}},
    type: "privileged"
  };
  let app = {};
  validator.validatePermissions(errors, warnings, manifest, app);
  assert.equal(errors.length, 1);
  assert.equal(errors[0], "Invalid access 'readonlyyy' in permission 'device-storage:videos'.");
}

exports["test permission access on permission without access"] = function(assert) {
  let errors = [], warnings = [];
  let manifest = {
    permissions: {"alarms" : {access: "readonly"}}
  };
  let app = {};
  validator.validatePermissions(errors, warnings, manifest, app);
  assert.equal(errors.length, 1);
  assert.equal(errors[0], "Invalid access 'readonly' in permission 'alarms'.");
}

exports["test permission denied access"] = function(assert) {
  // Use an access field that doesn't match the targeted permission accesses
  let errors = [], warnings = [];
  let manifest = {
    permissions: {"device-storage:apps" : {access: "createonly"}},
    type: "certified"
  };
  let app = {};
  validator.validatePermissions(errors, warnings, manifest, app);
  assert.equal(errors.length, 1);
  assert.equal(errors[0], "Invalid access 'createonly' in permission 'device-storage:apps'.");
}

exports["test checkManifest - non-numeric size"] = function(assert) {
  let errors = [], warnings = [];
  let manifest = {
    name: "foo",
    size: "non-numeric-size"
  };
  let app = {};
  validator.validateManifest(errors, warnings, manifest, app);
  assert.equal(errors.length, 1);
  assert.equal(errors[0], "This app can't be installed on a production device " +
                          "(AppsUtils.checkManifest return false).");
}

exports["test z teardown"] = function (assert, done) {
  server.stop(done);
  assert.pass("teardown");
}

require('sdk/test').run(exports);
