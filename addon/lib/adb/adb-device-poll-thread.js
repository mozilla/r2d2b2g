/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Core code
 */

'use strict';

const URL_PREFIX = self.location.href.replace(/adb\-device\-poll\-thread\.js/, "");
const INSTANTIATOR_URL = URL_PREFIX + "ctypes-instantiator.js";
const EVENTED_CHROME_WORKER_URL = URL_PREFIX + "evented-chrome-worker.js";
const CONSOLE_URL = URL_PREFIX + "worker-console.js";
const ADB_TYPES = URL_PREFIX + "adb-types.js";
const CTYPES_BRIDGE_BUILDER = URL_PREFIX + "ctypes-bridge-builder.js";
const JS_MESSAGE = URL_PREFIX + "js-message.js";
const COMMON_MESSAGE_HANDLER = URL_PREFIX + "common-message-handler.js";

importScripts(INSTANTIATOR_URL,
              EVENTED_CHROME_WORKER_URL,
              CONSOLE_URL,
              ADB_TYPES,
              CTYPES_BRIDGE_BUILDER,
              JS_MESSAGE,
              COMMON_MESSAGE_HANDLER);

const worker = new EventedChromeWorker(null, false);
const console = new Console(worker);

const I = new Instantiator;
let libadb = null;
<<<<<<< HEAD
let jsMsgFn = CommonMessageHandler(worker, console, function(channel, args) {
  switch(channel) {
    default:
      console.log("Unknown message: " + channel);
  }

  return JsMessage.pack(-1, Number);
});


=======
let restartMeFn = function restart_me() {
  worker.emitAndForget("restart-me", { });
};
let getLastError;
>>>>>>> AdbWinUsbApi.dll never loaded correctly
worker.once("init", function({ libPath, driversPath, platform }) {
  libadb = ctypes.open(libPath);

  let install_js_msg =
      I.declare({ name: "install_js_msg",
                  returns: ctypes.void_t,
                  args: [ JsMsgType.ptr ]
                }, libadb);

  install_js_msg(JsMsgType.ptr(jsMsgFn));

  // on Linux, fallback to pthreads here
  if (platform === "linux") {
    return;
  } else if (platform === "darwin") {
    I.declare({ name: "usb_monitor",
                returns: ctypes.int,
                args: [ ctypes.void_t.ptr ]
              }, libadb);

    I.use("usb_monitor")(NULL);
    console.debug("usb_monitor returned!");
  } else if (platform === "winnt") {
    const libadbdrivers = ctypes.open(driversPath);
    console.debug("opened libadbdrivers");

    const bridge_funcs = [
        { "AdbEnumInterfaces": AdbEnumInterfacesType },
        { "AdbCreateInterfaceByName": AdbCreateInterfaceByNameType },
        { "AdbCreateInterface": AdbCreateInterfaceType },
        { "AdbGetInterfaceName": AdbGetInterfaceNameType },
        { "AdbGetSerialNumber": AdbGetSerialNumberType },
        { "AdbGetUsbDeviceDescriptor": AdbGetUsbDeviceDescriptorType },
        { "AdbGetUsbConfigurationDescriptor": AdbGetUsbConfigurationDescriptorType },
        { "AdbGetUsbInterfaceDescriptor": AdbGetUsbInterfaceDescriptorType },
        { "AdbGetEndpointInformation": AdbGetEndpointInformationType },
        { "AdbGetDefaultBulkReadEndpointInformation": AdbGetDefaultBulkReadEndpointInformationType },
        { "AdbGetDefaultBulkWriteEndpointInformation": AdbGetDefaultBulkWriteEndpointInformationType },
        { "AdbOpenEndpoint": AdbOpenEndpointType },
        { "AdbOpenDefaultBulkReadEndpoint": AdbOpenDefaultBulkReadEndpointType },
        { "AdbOpenDefaultBulkWriteEndpoint": AdbOpenDefaultBulkWriteEndpointType },
        { "AdbGetEndpointInterface": AdbGetEndpointInterfaceType },
        { "AdbQueryInformationEndpoint": AdbQueryInformationEndpointType },
        { "AdbGetOvelappedIoResult": AdbGetOvelappedIoResultType },
        { "AdbHasOvelappedIoComplated": AdbHasOvelappedIoComplatedType },
        { "AdbCloseHandle": AdbCloseHandleType },
        { "AdbNextInterface": AdbNextInterfaceType }
      ];

    let bb = new BridgeBuilder(I, libadbdrivers);
    let [struct_dll_bridge, bridge, ref] = bb.build("dll_bridge", bridge_funcs);

    I.declare({ name: "usb_monitor",
                returns: ctypes.int,
                args: [ struct_dll_bridge.ptr ]
              }, libadb);
              
    let install_getLastError =
        I.declare({ name: "install_getLastError",
                    returns: ctypes.void_t,
                    args: [ IntCallableType.ptr ]
                  }, libadb);
    getLastError = bb.getLastError.bind(bb);
    install_getLastError(IntCallableType.ptr(getLastError));

    I.use("usb_monitor")(bridge.address());
    libadbdrivers.close();
  } else {
    throw "Unknown platform : " + platform
  }
  if (libadb) {
    libadb.close();
  }
  console.debug("Cleaned up device-poll-thread");
});
