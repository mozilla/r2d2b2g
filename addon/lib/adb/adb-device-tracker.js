/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * A module to track device changes
 * Mostly from original `adb.js`
 */

'use strict';

const { Cc, Ci, Cr, Cu } = require("chrome");
const { Class } = require("sdk/core/heritage");
const client = require("adb/adb-client");

Cu.import("resource://gre/modules/Services.jsm");

let { TextDecoder } = Cu.import("resource://gre/modules/Services.jsm");

function debug() {
  console.debug.apply(console, ["ADB: "].concat(Array.prototype.slice.call(arguments, 0)));
}

let waitForFirst = true;
let devices = { };
let socket;
let hasDevice = false;
module.exports = {
  get hasDevice() {
    return hasDevice;
  },

  reset: function reset() {
    waitForFirst = false;
    devices = { };
    socket.close();
    hasDevice = false;
  },

  start: function track_start() {
    socket = client.connect();
    Services.obs.notifyObservers(null, "adb-track-devices-start", null);

    socket.s.onopen = function() {
      debug("trackDevices onopen");
      // Services.obs.notifyObservers(null, "adb-track-devices-start", null);
      let req = client.createRequest("host:track-devices");
      socket.send(req);
    };

    socket.s.onerror = function(event) {
      debug("trackDevices onerror: " + event.data);
      Services.obs.notifyObservers(null, "adb-track-devices-stop", null);
    };

    socket.s.onclose = function() {
      debug("trackDevices onclose");
      Services.obs.notifyObservers(null, "adb-track-devices-stop", null);
    };

    socket.s.ondata = function(aEvent) {
      debug("trackDevices ondata");
      let data = aEvent.data;
      debug("length=" + data.byteLength);
      let dec = new TextDecoder();
      debug(dec.decode(new Uint8Array(data)).trim());

      // check the OKAY or FAIL on first packet.
      if (waitForFirst) {
        if (!client.checkResponse(data)) {
          socket.close();
          return;
        }
      }

      let packet = client.unpackPacket(data, !waitForFirst);
      waitForFirst = false;

      if (packet.data == "") {
        hasDevice = false;
        // All devices got disconnected.
        for (let dev in devices) {
          devices[dev] = false;
          Services.obs.notifyObservers(null, "adb-device-disconnected", dev);
        }
      } else {
        hasDevice = true;
        // One line per device, each line being $DEVICE\t(offline|device)
        let lines = packet.data.split("\n");
        let newDev = {};
        lines.forEach(function(aLine) {
          if (aLine.length == 0) {
            return;
          }

          let [dev, status] = aLine.split("\t");
          newDev[dev] = status !== "offline";
        });
        // Check which device changed state.
        for (let dev in newDev) {
          if (devices[dev] != newDev[dev]) {
            if (dev in devices || newDev[dev]) {
              let topic = newDev[dev] ? "adb-device-connected"
                                      : "adb-device-disconnected";
              Services.obs.notifyObservers(null, topic, dev);
            }
            devices[dev] = newDev[dev];
          }
        }
      }
    };
  },

  stop: function track_stop() {
    socket.close();
  }
}

