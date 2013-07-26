/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const { Cu } = require("chrome");
Cu.import("resource://gre/modules/ctypes.jsm");
const { platform } = require("system");

const { Instantiator } = require("adb/ctypes-instantiator");
const { unpackPtr, atransport, AdbCloseHandleType, NULL, CallbackType } =
    require("adb/adb-types");
const { ioUtils } = require("adb/io-utils");

const I = new Instantiator();
let libadb, libadbdrivers;
let io;
module.exports = {
  reset: function reset() {

  },

  init: function init(libPath, driversPath) {
    libadb = ctypes.open(libPath);

    io = ioUtils(I, libadb);

    I.declare({ name: "cleanup",
                returns: ctypes.void_t,
                args: [ ]
              }, libadb);

    if (platform === "darwin" || platform === "winnt") {
      I.declare({ name: "kill_threads",
                  returns: ctypes.void_t,
                  args: []
                }, libadb);
    }

    if (platform === "winnt") {
      libadbdrivers = ctypes.open(driversPath);

      I.declare({ name: "AdbCloseHandle",
                  returns: AdbCloseHandleType.returnType,
                  args: AdbCloseHandleType.argTypes
                }, libadbdrivers);

      I.declare({ name: "should_die_fdevent",
                  returns: ctypes.void_t,
                  args: [],
                }, libadb);
    }

    I.declare({ name: "on_kill_io_pump",
                returns: ctypes.void_t,
                args: [ atransport.ptr, AdbCloseHandleType.ptr ]
              }, libadb);
  },

  cleanupNativeCode: function cleanupNativeCode() {
    console.debug("Cleaning up native code");
    I.use("cleanup")();
    libadb.close();
    if (platform === "winnt") {
      libadbdrivers.close();
    }
  },

  killNativeSafely: function killNativeSafely() {
    // if we're not on OSX or Windows, we don't have to do anything
    if (platform === "darwin" || platform === "winnt") {
      I.use("kill_threads")();
    }
  },

  waitForServerDeath: function waitForServerDeath() {
    if (platform === "winnt") {
      I.use("should_die_fdevent")();
    }
  },

  killIOPump: function killIOPump(t_ptrS) {
    let t_ptr = unpackPtr(t_ptrS, atransport.ptr);
    let close_handle_func;
    if (platform === "winnt") {
      let bridge = function close_bridge() {
        let f = I.use("AdbCloseHandle");
        // call the real DLL function with the arguments to the bridge call
        return f.apply(f, arguments);
      };
      close_handle_func = AdbCloseHandleType.ptr(bridge);
    } else {
      close_handle_func = ctypes.cast(NULL, AdbCloseHandleType.ptr);
    }

    let onKillIOPump = I.use("on_kill_io_pump");
    onKillIOPump.apply(onKillIOPump, [t_ptr, close_handle_func]);
  },

  writeFully: function writeFully(fd, toWriteS, length) {
    return io.writeFully(fd, toWriteS, length);
  }
};

