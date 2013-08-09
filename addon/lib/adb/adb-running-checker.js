/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Uses host:version service to detect if ADB is running
 * Modified from adb-file-transfer from original ADB
 */

'use strict';

const { Cu, Cc, Ci } = require("chrome");

const Promise = require("sdk/core/promise");
const client = require("adb/adb-client");

function debug() {
  console.debug.apply(console, ["ADB: "].concat(Array.prototype.slice.call(arguments, 0)));
}

exports.check = function check() {
  let deferred = Promise.defer();
  let socket;
  let state;

  debug("Asking for host:version");

  let runFSM = function runFSM(aData) {
    debug("runFSM " + state);
    switch(state) {
      case "start":
        let req = client.createRequest("host:version");
        socket.send(req);
        state = "wait-version";
        break
      case "wait-version":
        // TODO: Actually check the version number to make sure the daemon
        //       supports the commands we want to use
        let { length, data } = client.unpackPacket(aData);
        debug("length: ", length, "data: ", data);
        socket.close();
        deferred.resolve(data.indexOf("001f") != -1);
        break;
      default:
        debug("Unexpected State: " + state);
        deferred.resolve(false);
    }
  };

  let setupSocket = function() {
    socket.s.onerror = function(aEvent) {
      debug("running checker onerror");
      deferred.resolve(false);
    };

    socket.s.onopen = function(aEvent) {
      debug("running checker onopen");
      state = "start";
      runFSM();
    }

    socket.s.onclose = function(aEvent) {
      debug("running checker onclose");
    };

    socket.s.ondata = function(aEvent) {
      debug("running checker ondata");
      runFSM(aEvent.data);
    };
  };

  socket = client.connect();
  setupSocket();

  return deferred.promise;
};
