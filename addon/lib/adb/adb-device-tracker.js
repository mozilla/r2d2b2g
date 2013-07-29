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

let devices = { };
let hasDevice = false;
let listenId = null;
let worker = null;
module.exports = {
  get hasDevice() {
    return hasDevice;
  },

  start: function(worker_) {
    worker = worker_;
    debug("Starting deviceTracker");
    listenId = worker.listenAndForget("device-update", (function onDeviceUpdate({ msg }) {
      debug("Got device update: " + msg);
      this.handleChange(msg);
    }).bind(this));
  },

  handleChange: function handleChange(msg) {
    if (msg == "") {
      hasDevice = false;
      // All devices got disconnected.
      for (let dev in devices) {
        devices[dev] = false;
        Services.obs.notifyObservers(null, "adb-device-disconnected", dev);
      }
    } else {
      hasDevice = true;
      // One line per device, each line being $DEVICE\t(offline|device)
      let lines = msg.split("\n");
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
  },

  stop: function stop() {
    if (listenId !== null) {
      worker.freeListener("device-update", listenId);
    }
  },

  reset: function reset() {
    devices = { };
    hasDevice = false;
    listenId = null;
  }
}

