/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const RemoteSimulatorClient = require("remote-simulator-client");

exports["test:RemoteSimulatorClient run/onReady/onStdout/onExit"] = function(test, done) {
  var timeout = false;
  var stdout = false;
  var rsc = new RemoteSimulatorClient({
    onStdout: function (data) { if (data.search("__test_stdout__") >= 0) stdout = true; },
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

exports["test:RemoteSimulatorClient isExitedWithoutReady"] = function(test, done) {
  var rsc2 = new RemoteSimulatorClient({
    onReady: function () {      
      test.pass("emulator2 ready");
    },
    onTimeout: function () {
      test.pass("emulator2 timeout");
      // cleanup on emulator2 timeout
      cleanup();
    },
    onExit: function () {
      test.pass("emulator2 exit");
      // start cleanup
      cleanup();
    }
  });

  var rsc1 = new RemoteSimulatorClient({
    onReady: function () {      
      test.pass("emulator1 ready");
      // run a second emulator instance
      rsc2.run();
    },
    onTimeout: function () {
      test.pass("emulator1 timeout");
      // cleanup on emulator1 timeout
      cleanup();
    },
    onExit: function () {      
      test.pass("emulator1 exit");
      test.ok(rsc1.isExitedWithoutReady == false, 
              "rsc1 should exit after a completed run");
      test.ok(rsc2.isExitedWithoutReady == true, 
              "rsc2.isExitedWithoutReady should be true");
      done();
    }
  });

  rsc1.run();

  function cleanup() {
    rsc1.kill();
    rsc2.kill();
  }
};

require('sdk/test').run(exports);
