/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Core code
 */

'use strict';

const URL_PREFIX = self.location.href.replace(/adb\-io\-thread\-spawner.js/, "");
const INSTANTIATOR_URL = URL_PREFIX + "ctypes-instantiator.js";
const EVENTED_CHROME_WORKER_URL = URL_PREFIX + "evented-chrome-worker.js";
const CONSOLE_URL = URL_PREFIX + "worker-console.js";
const ADB_TYPES = URL_PREFIX + "adb-types.js";
const CTYPES_BRIDGE_BUILDER = URL_PREFIX + "ctypes-bridge-builder.js";

importScripts(INSTANTIATOR_URL, EVENTED_CHROME_WORKER_URL, CONSOLE_URL, ADB_TYPES, CTYPES_BRIDGE_BUILDER);

const worker = new EventedChromeWorker(null, false);
const console = new Console(worker);

let I = null;
let libadb = null;
let restartMeFn = function restart_me() {
  worker.emitAndForget("restart-me", { });
};
let getLastError;
worker.once("init", function({ libPath, driversPath, threadName, t_ptrS, platform }) {
  I = new Instantiator();

  let t_ptr = unpackPtr(t_ptrS, atransport.ptr);

  libadb = ctypes.open(libPath);

  let install_thread_locals =
      I.declare({ name: "install_thread_locals",
                  returns: ctypes.void_t,
                  args: [ CallbackType.ptr ]
                }, libadb);

  install_thread_locals(CallbackType.ptr(restartMeFn));

  if (platform === "winnt") {
    const libadbdrivers = ctypes.open(driversPath);

    const io_bridge_funcs = [
      { "AdbReadEndpointAsync": AdbReadEndpointAsyncType },
      { "AdbWriteEndpointAsync": AdbWriteEndpointAsyncType },
      { "AdbReadEndpointSync": AdbReadEndpointSyncType },
      { "AdbWriteEndpointSync": AdbWriteEndpointSyncType },
      { "AdbCloseHandle": AdbCloseHandleType },
    ];

    let bb = new BridgeBuilder(I, libadbdrivers);
    let [struct_dll_io_bridge, io_bridge, ref] =
      bb.build("dll_io_bridge", io_bridge_funcs);

    let install_getLastError =
        I.declare({ name: "install_getLastError",
                    returns: ctypes.void_t,
                    args: [ IntCallableType.ptr ]
                  }, libadb);
    getLastError = bb.getLastError.bind(bb);
    install_getLastError(IntCallableType.ptr(getLastError));

    I.declare({ name: threadName,
                returns: ctypes.int,
                args: [ atransport.ptr, struct_dll_io_bridge.ptr ]
              }, libadb);

    console.debug("Spawning: " + threadName);
    let spawn = I.use(threadName);

    return spawn.apply( spawn, [ t_ptr, io_bridge.address() ] );
  } else {
    I.declare({ name: threadName,
                returns: ctypes.int,
                args: [ atransport.ptr ]
              }, libadb);

    console.debug("Spawning: " + threadName);
    let spawn = I.use(threadName);

    return spawn.apply( spawn, [ t_ptr ] );
  }
});

