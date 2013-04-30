/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const RemoteSimulatorClient = require("remote-simulator-client");

exports["test RemoteSimulatorClient run/ping/kill"] = function(assert, done) {
  var output = "";
  var rsc = new RemoteSimulatorClient({
    onReady: function onReady() {
      assert.pass("simulator ready");
      rsc.ping(
        function onResponse(response) {
          assert.equal(response.msg, "pong", "ping response is pong");
          rsc.kill();
        }
      );
    },

    onStdout: function onStdout(data) {
      output += data;
    },

    onTimeout: function onTimeout() {
      assert.fail("simulator should not time out");
    },

    onExit: function onExit() {
      assert.pass("simulator exit");
      assert.ok(output.contains("simulator actor received a 'ping' command"),
                "stdout includes debug message about 'ping' request");
      done();
    }
  });

  rsc.run();
};

require('sdk/test').run(exports);
