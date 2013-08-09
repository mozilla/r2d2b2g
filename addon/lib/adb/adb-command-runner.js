/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * A module to run adb commands
 * Mostly from original `adb.js`
 */

'use strict';

const { Cu, Cc, Ci } = require("chrome");

const Promise = require("sdk/core/promise");
const { Class } = require("sdk/core/heritage");
const client = require("adb/adb-client");

function debug() {
  console.debug.apply(console, ["ADB: "].concat(Array.prototype.slice.call(arguments, 0)));
}

function runCommand(aCommand) {
  debug("runCommand " + aCommand);
  let deferred = Promise.defer();

  let socket = client.connect();
  socket.s.onopen = function() {
    let req = client.createRequest(aCommand);
    socket.send(req);
  };
  socket.s.onerror = function() {
    debug("runCommand onerror");
    deferred.reject("NETWORK_ERROR");
  };
  socket.s.onclose = function() {
    debug("runCommand onclose");
  };
  socket.s.ondata = function(aEvent) {
    debug("runCommand ondata");
    let data = aEvent.data;

    if (!client.checkResponse(data)) {
      socket.close();
      let packet = client.unpackPacket(data, false);
      debug("Error: " + packet.data);
      deferred.reject("PROTOCOL_ERROR");
      return;
    }

    let packet = client.unpackPacket(data, false);
    deferred.resolve(packet.data);
  };


  return deferred.promise;
}

exports.reset = function() {

};

