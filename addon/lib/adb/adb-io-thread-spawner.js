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
const JS_MESSAGE = URL_PREFIX + "js-message.js";
const COMMON_MESSAGE_HANDLER = URL_PREFIX + "common-message-handler.js";

importScripts(INSTANTIATOR_URL,
              EVENTED_CHROME_WORKER_URL,
              CONSOLE_URL, ADB_TYPES,
              CTYPES_BRIDGE_BUILDER,
              JS_MESSAGE,
              COMMON_MESSAGE_HANDLER);

const worker = new EventedChromeWorker(null, false);
const console = new Console(worker);

let I = null;
let libadb = null;
let getLastError = function() { return 0; };
let jsMsgFn = CommonMessageHandler(worker, console, function(channel, args) {
  switch(channel) {
    case "get-last-error":
      return JsMessage.pack(getLastError(), Number);
    default:
      console.log("Unknown message: " + channel);
  }

  return JsMessage.pack(-1, Number);
});

worker.once("init", function({ libPath, driversPath, threadName, t_ptrS, platform }) {
  I = new Instantiator();

  let t_ptr = unpackPtr(t_ptrS, atransport.ptr);

  libadb = ctypes.open(libPath);

  let install_js_msg =
      I.declare({ name: "install_js_msg",
                  returns: ctypes.void_t,
                  args: [ JsMsgType.ptr ]
                }, libadb);

  install_js_msg(JsMsgType.ptr(jsMsgFn));

  if (platform === "winnt") {
    const libadbdrivers = ctypes.open(driversPath);

    const io_bridge_funcs = [
      { "AdbReadEndpointAsync": AdbReadEndpointAsyncType },
      { "AdbWriteEndpointAsync": AdbWriteEndpointAsyncType },
      { "AdbHasOvelappedIoComplated": AdbHasOvelappedIoComplatedType },
      { "AdbReadEndpointSync": AdbReadEndpointSyncType },
      { "AdbWriteEndpointSync": AdbWriteEndpointSyncType },
      { "AdbCloseHandle": AdbCloseHandleType },
      { "AdbGetOvelappedIoResult": AdbGetOvelappedIoResultType }
    ];

    let bb = new BridgeBuilder(I, libadbdrivers);
    let [struct_dll_io_bridge, io_bridge, ref] =
      bb.build("dll_io_bridge", io_bridge_funcs);

    getLastError = bb.getLastError.bind(bb);

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

