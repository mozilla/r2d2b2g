/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const RemoteSimulatorClient = require("remote-simulator-client");

exports["test:RemoteSimulatorClient run/onReady/onStdout/onExit"] = function(test, done) {
  var timeout = false;
  var stdout = false;
  var rsc = new RemoteSimulatorClient({
    onStdout: function (data) { 
      if (data.search("__test_stdout__") >= 0) {
        stdout = true;
      }
    },
    onReady: function () {      
      test.pass("emulator ready");
      rsc.logStdout("__test_stdout__", function () {
        rsc.getBuildID(function (response) {
          console.log("RESPONSE RECEIVED", response.buildID);
          test.ok("buildID" in response, "response should contains buildID");
          rsc.kill();
        });
      });
    },
    onTimeout: function () {
      timeout = true;
    },
    onExit: function () {
      test.pass("emulator exit");
      test.ok(!timeout, "timeout should not be true");
      test.ok(stdout, "log to stdout should work correctly");
      done();
    }
  });

  rsc.run();
};

require('sdk/test').run(exports);
