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

importScripts(INSTANTIATOR_URL, EVENTED_CHROME_WORKER_URL, CONSOLE_URL, ADB_TYPES, CTYPES_BRIDGE_BUILDER);

const worker = new EventedChromeWorker(null, false);
const console = new Console(worker);

const I = new Instantiator;
let libadb = null;
let restartMeFn = function restart_me() {
  worker.emitAndForget("restart-me", { });
};

worker.once("init", function({ libPath, driversPath, platform }) {
  libadb = ctypes.open(libPath);

  let install_thread_locals =
      I.declare({ name: "install_thread_locals",
                  returns: ctypes.void_t,
                  args: [ CallbackType.ptr ]
                }, libadb);

  install_thread_locals(CallbackType.ptr(restartMeFn));

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

    let [struct_dll_bridge, bridge, ref] = new BridgeBuilder(I, libadbdrivers).build("dll_bridge", bridge_funcs);

    I.declare({ name: "usb_monitor",
                returns: ctypes.int,
                args: [ struct_dll_bridge.ptr ]
              }, libadb);

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
