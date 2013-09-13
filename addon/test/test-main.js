/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Note: all tests that depend on firefox state should be put in this
 * file.  Re-requiring main in other tests causes the simulator to be
 * reinstantiated.
 */

require("main");

exports = (function(exports) {

  exports["test import main"] = function(assert, done) {
    assert.pass("require(main) works");
    done();
  };

  return exports;
})(exports);

require("test").run(exports);
