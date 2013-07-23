/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

;(function(exports, module) {

  let isModule = !!module;
  if (!isModule) {
    module = {};
  } else {
    const { Cu } = require("chrome");
    Cu.import("resource://gre/modules/ctypes.jsm");
  }

  const NULL = ctypes.cast(ctypes.uint64_t(0x0), ctypes.void_t.ptr);
  const CallbackType = ctypes.FunctionType(ctypes.default_abi, ctypes.void_t, []);
  const IntCallableType = ctypes.FunctionType(ctypes.default_abi, ctypes.int, []);
  const AdbOpenAccessType = ctypes.int;
  const AdbOpenSharingMode = ctypes.int;
  const AdbInterfaceInfo =
    new ctypes.StructType("AdbInterfaceInfo");
  const GUID =
    new ctypes.StructType("GUID", [
      { "Data1": ctypes.uint64_t },
      { "Data2": ctypes.uint16_t },
      { "Data3": ctypes.uint16_t },
      { "Data4": ctypes.ArrayType(ctypes.uint8_t, 8) }
    ]);
  const ADBAPIHANDLE = ctypes.void_t.ptr;
  const wchar_t = ctypes.jschar;
  const bool = ctypes.int;
  const USB_DEVICE_DESCRIPTOR =
    new ctypes.StructType("USB_DEVICE_DESCRIPTOR");
  const USB_CONFIGURATION_DESCRIPTOR =
    new ctypes.StructType("USB_CONFIGURATION_DESCRIPTOR");
  const USB_INTERFACE_DESCRIPTOR =
    new ctypes.StructType("USB_INTERFACE_DESCRIPTOR");
  const AdbEndpointInformation =
    new ctypes.StructType("AdbEndpointInformation");
  const HANDLE = ctypes.void_t.ptr;
  const LPOVERLAPPED = ctypes.void_t.ptr;

  const AdbReadEndpointAsyncType =
    ctypes.FunctionType(ctypes.default_abi, ADBAPIHANDLE, [ ctypes.void_t.ptr, ctypes.uint64_t, ctypes.uint64_t.ptr, ctypes.uint64_t, HANDLE ]);
  const AdbWriteEndpointAsyncType =
    ctypes.FunctionType(ctypes.default_abi, ADBAPIHANDLE, [ ADBAPIHANDLE, ctypes.void_t.ptr, ctypes.uint64_t, ctypes.uint64_t.ptr, ctypes.uint64_t, HANDLE ]);
  const AdbReadEndpointSyncType =
    ctypes.FunctionType(ctypes.default_abi, bool, [ ADBAPIHANDLE, ctypes.void_t.ptr, ctypes.uint64_t, ctypes.uint64_t.ptr, ctypes.uint64_t ]);
  const AdbWriteEndpointSyncType =
    ctypes.FunctionType(ctypes.default_abi, bool, [ ADBAPIHANDLE, ctypes.void_t.ptr, ctypes.uint64_t, ctypes.uint64_t.ptr, ctypes.uint64_t ]);

  const AdbEnumInterfacesType =
    ctypes.FunctionType(ctypes.default_abi, ADBAPIHANDLE, [ GUID, bool, bool, bool ]);
  const AdbCreateInterfaceByNameType = 
    ctypes.FunctionType(ctypes.default_abi, ADBAPIHANDLE, [ wchar_t.ptr ]);
  const AdbCreateInterfaceType = 
    ctypes.FunctionType(ctypes.default_abi, ADBAPIHANDLE, [ GUID, ctypes.uint16_t, ctypes.uint16_t, ctypes.uint8_t ]);
  const AdbGetInterfaceNameType =
    ctypes.FunctionType(ctypes.default_abi, bool, [ ADBAPIHANDLE, ctypes.void_t.ptr, ctypes.uint64_t.ptr, bool ]);
  const AdbGetSerialNumberType =
    ctypes.FunctionType(ctypes.default_abi, bool, [ ADBAPIHANDLE, ctypes.void_t.ptr, ctypes.uint64_t.ptr, bool ]);
  const AdbGetUsbDeviceDescriptorType = 
    ctypes.FunctionType(ctypes.default_abi, bool, [ ADBAPIHANDLE, USB_DEVICE_DESCRIPTOR.ptr ]);
  const AdbGetUsbConfigurationDescriptorType =
    ctypes.FunctionType(ctypes.default_abi, bool, [ ADBAPIHANDLE, USB_CONFIGURATION_DESCRIPTOR.ptr ]);
  const AdbGetUsbInterfaceDescriptorType =
    ctypes.FunctionType(ctypes.default_abi, bool, [ ADBAPIHANDLE, USB_INTERFACE_DESCRIPTOR.ptr ]);
  const AdbGetEndpointInformationType =
    ctypes.FunctionType(ctypes.default_abi, bool, [ ADBAPIHANDLE, ctypes.uint8_t, AdbEndpointInformation.ptr ]);
  const AdbGetDefaultBulkReadEndpointInformationType =
    ctypes.FunctionType(ctypes.default_abi, bool, [ ADBAPIHANDLE, AdbEndpointInformation.ptr ]);
  const AdbGetDefaultBulkWriteEndpointInformationType =
    ctypes.FunctionType(ctypes.default_abi, bool, [ ADBAPIHANDLE, AdbEndpointInformation.ptr ]);
  const AdbOpenEndpointType =
    ctypes.FunctionType(ctypes.default_abi, ADBAPIHANDLE, [ ADBAPIHANDLE, ctypes.uint8_t, AdbOpenAccessType, AdbOpenSharingMode ]);
  const AdbOpenDefaultBulkReadEndpointType =
    ctypes.FunctionType(ctypes.default_abi, ADBAPIHANDLE, [ ADBAPIHANDLE, AdbOpenAccessType, AdbOpenSharingMode ]);
  const AdbOpenDefaultBulkWriteEndpointType =
    ctypes.FunctionType(ctypes.default_abi, ADBAPIHANDLE, [ ADBAPIHANDLE, AdbOpenAccessType, AdbOpenSharingMode ]);
  const AdbGetEndpointInterfaceType =
    ctypes.FunctionType(ctypes.default_abi, ADBAPIHANDLE, [ ADBAPIHANDLE ]);
  const AdbQueryInformationEndpointType =
    ctypes.FunctionType(ctypes.default_abi, bool, [ ADBAPIHANDLE, AdbEndpointInformation.ptr ]);
  const AdbGetOvelappedIoResultType =
    ctypes.FunctionType(ctypes.default_abi, bool, [ ADBAPIHANDLE, LPOVERLAPPED, ctypes.uint64_t.ptr, bool ]);
  const AdbHasOvelappedIoComplatedType =
    ctypes.FunctionType(ctypes.default_abi, bool, [ ADBAPIHANDLE ]);
  const AdbCloseHandleType =
    ctypes.FunctionType(ctypes.default_abi, bool, [ ADBAPIHANDLE ]);
  const AdbNextInterfaceType =
    ctypes.FunctionType(ctypes.default_abi, bool, [ ADBAPIHANDLE, AdbInterfaceInfo.ptr, ctypes.uint64_t.ptr ]);

  const atransport = 
    new ctypes.StructType("atransport");

  const struct_adb_main_input =
    new ctypes.StructType("adb_main_input", [
      { is_daemon: ctypes.int },
      { server_port: ctypes.int },
      { is_lib_call: ctypes.int },

      { exit_fd: ctypes.int },

      { on_track_ready: ctypes.FunctionType(ctypes.default_abi, ctypes.void_t, []).ptr },

      { spawnIO: ctypes.FunctionType(ctypes.default_abi, ctypes.int, [ atransport.ptr ]).ptr },
      { spawnD: ctypes.FunctionType(ctypes.default_abi, ctypes.int).ptr },

      { log_path: ctypes.char.ptr }
    ]);

  module.exports = {
    NULL: NULL,
    CallbackType: CallbackType,
    IntCallableType: IntCallableType,
    AdbOpenAccessType: AdbOpenAccessType,
    AdbOpenSharingMode: AdbOpenSharingMode,
    AdbInterfaceInfo: AdbInterfaceInfo,
    GUID: GUID,
    ADBAPIHANDLE: ADBAPIHANDLE,
    wchar_t: wchar_t,
    bool: bool,
    USB_DEVICE_DESCRIPTOR: USB_DEVICE_DESCRIPTOR,
    USB_CONFIGURATION_DESCRIPTOR: USB_CONFIGURATION_DESCRIPTOR,
    USB_INTERFACE_DESCRIPTOR: USB_INTERFACE_DESCRIPTOR,
    AdbEndpointInformation: AdbEndpointInformation,
    HANDLE: HANDLE,
    LPOVERLAPPED: LPOVERLAPPED,

    AdbReadEndpointAsyncType: AdbReadEndpointAsyncType,
    AdbWriteEndpointAsyncType: AdbWriteEndpointAsyncType,
    AdbReadEndpointSyncType: AdbReadEndpointSyncType,
    AdbWriteEndpointSyncType: AdbWriteEndpointSyncType,

    AdbEnumInterfacesType: AdbEnumInterfacesType,
    AdbCreateInterfaceByNameType: AdbCreateInterfaceByNameType,
    AdbCreateInterfaceType: AdbCreateInterfaceType,
    AdbGetInterfaceNameType: AdbGetInterfaceNameType,
    AdbGetSerialNumberType: AdbGetSerialNumberType,
    AdbGetUsbDeviceDescriptorType: AdbGetUsbDeviceDescriptorType,
    AdbGetUsbConfigurationDescriptorType: AdbGetUsbConfigurationDescriptorType,
    AdbGetUsbInterfaceDescriptorType: AdbGetUsbInterfaceDescriptorType,
    AdbGetEndpointInformationType: AdbGetEndpointInformationType,
    AdbGetDefaultBulkReadEndpointInformationType: AdbGetDefaultBulkReadEndpointInformationType,
    AdbGetDefaultBulkWriteEndpointInformationType: AdbGetDefaultBulkWriteEndpointInformationType,
    AdbOpenEndpointType: AdbOpenEndpointType,
    AdbOpenDefaultBulkReadEndpointType: AdbOpenDefaultBulkReadEndpointType,
    AdbOpenDefaultBulkWriteEndpointType: AdbOpenDefaultBulkWriteEndpointType,
    AdbGetEndpointInterfaceType: AdbGetEndpointInterfaceType,
    AdbQueryInformationEndpointType: AdbQueryInformationEndpointType,
    AdbGetOvelappedIoResultType: AdbGetOvelappedIoResultType,
    AdbHasOvelappedIoComplatedType: AdbHasOvelappedIoComplatedType,
    AdbCloseHandleType: AdbCloseHandleType,
    AdbNextInterfaceType: AdbNextInterfaceType,

    atransport: atransport,

    struct_adb_main_input: struct_adb_main_input,

    packPtr: function packPointer(ptr) {
      return ctypes.cast(ptr, ctypes.uintptr_t).value.toString();
    },

    unpackPtr: function unpackPointer(str, type) {
      return ctypes.cast(ctypes.uintptr_t(str), type);
    }
  };

  if (!isModule) {
    for (let k in module.exports) {
      exports[k] = module.exports[k];
    }
  }
  
}).apply(null,
  typeof module !== 'undefined' ?
       [exports, module] : [this]);

