/*
 * Copyright (C) 2007 The Android Open Source Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#include "Stdafx.h"

#include <winerror.h>
#include <errno.h>
#include <usb100.h>
#include <adb_api.h>
#include <stdio.h>

#include "sysdeps.h"

#define   TRACE_TAG  TRACE_USB
#include "adb.h"

#if 0
#define AdbWriteEndpointSync(...) (0)
#define AdbReadEndpointSync(...) (0)
#define AdbOpenDefaultBulkWriteEndpoint(...) (malloc(sizeof(usb_handle)))
#define AdbOpenDefaultBulkReadEndpoint(...) (malloc(sizeof(usb_handle)))
#define AdbNextInterface(...) (false)
#define AdbGetUsbInterfaceDescriptor(...) (false)
#define AdbGetUsbDeviceDescriptor(...) (false)
#define AdbGetSerialNumber(...) (false)
#define AdbGetInterfaceName(...) (false)
#define AdbGetEndpointInformation(...) (false)
#define AdbEnumInterfaces(...) ((ADBAPIHANDLE)NULL)
#define AdbCreateInterfaceByName(...) ((ADBAPIHANDLE)NULL)
#define AdbCloseHandle(...) (false)
#endif

#define D_ D
#undef D
#define D printf


/** Structure usb_handle describes our connection to the usb device via
  AdbWinApi.dll. This structure is returned from usb_open() routine and
  is expected in each subsequent call that is accessing the device.
*/
struct usb_handle {
  /// Previous entry in the list of opened usb handles
  usb_handle *prev;

  /// Next entry in the list of opened usb handles
  usb_handle *next;

  /// Handle to USB interface
  ADBAPIHANDLE  adb_interface;

  /// Handle to USB read pipe (endpoint)
  ADBAPIHANDLE  adb_read_pipe;

  /// Handle to USB write pipe (endpoint)
  ADBAPIHANDLE  adb_write_pipe;

  /// Interface name
  char*         interface_name;

  /// Mask for determining when to use zero length packets
  unsigned zero_mask;
};

/// Class ID assigned to the device by androidusb.sys
static const GUID usb_class_id = ANDROID_USB_CLASS_ID;

/// List of opened usb handles
static usb_handle handle_list = {
  /* .prev = */ &handle_list,
  /* .next = */ &handle_list,
};

/// Locker for the should_kill_cond wait
ADB_MUTEX_DEFINE( should_kill_cond_lock );

/// Locker for the should_kill signal
ADB_MUTEX_DEFINE( should_kill_lock );

/// Locker for the list of opened usb handles
ADB_MUTEX_DEFINE( usb_lock );

/// Checks if there is opened usb handle in handle_list for this device.
int known_device(const char* dev_name);

/// Checks if there is opened usb handle in handle_list for this device.
/// usb_lock mutex must be held before calling this routine.
int known_device_locked(const char* dev_name);

/// Registers opened usb handle (adds it to handle_list).
int register_new_device(usb_handle* handle);

/// Checks if interface (device) matches certain criteria
int recognized_device(usb_handle* handle);

/// Enumerates present and available interfaces (devices), opens new ones and
/// registers usb transport for them.
void find_devices();

/// Entry point for thread that polls (every second) for new usb interfaces.
/// This routine calls find_devices in infinite loop.
void* device_poll_thread(void* unused);

/// Initializes this module
void usb_init(int(*spawnD)());

/// Cleans up this module
void usb_cleanup();

/// Opens usb interface (device) by interface (device) name.
usb_handle* do_usb_open(const wchar_t* interface_name);

/// Writes data to the opened usb handle
int usb_write(usb_handle* handle, const void* data, int len);

/// Reads data using the opened usb handle
int usb_read(usb_handle *handle, void* data, int len);

/// Cleans up opened usb handle
void usb_cleanup_handle(usb_handle* handle, bool (*close_handle_func)(ADBAPIHANDLE), char * tag);

/// Cleans up (but don't close) opened usb handle
void usb_kick(usb_handle *h, bool (*close_handle_func)(ADBAPIHANDLE));

/// Closes opened usb handle
int usb_close(usb_handle* handle, bool (*close_handle_func)(ADBAPIHANDLE));

/// Gets interface (device) name for an opened usb handle
const char *usb_name(usb_handle* handle);

static struct dll_bridge * bridge;
extern struct dll_io_bridge * i_bridge;
extern struct dll_io_bridge * o_bridge;

//#define D_ D
//#undef D
//#define D printf

int known_device_locked(const char* dev_name) {
  usb_handle* usb;

  if (NULL != dev_name) {
    // Iterate through the list looking for the name match.
    for(usb = handle_list.next; usb != &handle_list; usb = usb->next) {
      // In Windows names are not case sensetive!
      if((NULL != usb->interface_name) &&
         (0 == stricmp(usb->interface_name, dev_name))) {
        return 1;
      }
    }
  }

  return 0;
}

int known_device(const char* dev_name) {
  int ret = 0;

  if (NULL != dev_name) {
    adb_mutex_lock(&usb_lock);
    ret = known_device_locked(dev_name);
    adb_mutex_unlock(&usb_lock);
  }

  return ret;
}

int register_new_device(usb_handle* handle) {
  if (NULL == handle)
    return 0;

  adb_mutex_lock(&usb_lock);

  // Check if device is already in the list
  if (known_device_locked(handle->interface_name)) {
    adb_mutex_unlock(&usb_lock);
    return 0;
  }

  // Not in the list. Add this handle to the list.
  handle->next = &handle_list;
  handle->prev = handle_list.prev;
  handle->prev->next = handle;
  handle->next->prev = handle;

  adb_mutex_unlock(&usb_lock);

  return 1;
}


static int should_kill = 0;
static adb_cond_t should_kill_cond;
static void set_should_kill(int val) {
  adb_mutex_lock(&should_kill_lock);
  D("Set should_kill to %d\n", val);
  should_kill = val;
  adb_mutex_unlock(&should_kill_lock);
}

static int get_should_kill() {
  adb_mutex_lock(&should_kill_lock);
  int tmp = should_kill;
  adb_mutex_unlock(&should_kill_lock);
  return tmp;
}

void notify_should_kill(int k, char who) {
  if (k < 0) {
    k = get_should_kill();
    if (k == 0) {
      return;
    }
  }

  set_should_kill(k+1);
  adb_cond_broadcast(&should_kill_cond);
}

// signals the device_loop and device_output_thread
void should_kill_threads() {
  set_should_kill(1);

  adb_mutex_lock(&should_kill_cond_lock);
  // wait for both the device loop's and the input_thread's death (if it exists)
  int is_io_pump_on = get_io_pump_status();
  D("Waiting for %d notifications\n", 2 + is_io_pump_on - 1);
  while(should_kill < (2 + is_io_pump_on)) {
    // hang on a condition
    adb_cond_wait(&should_kill_cond, &should_kill_cond_lock);
  }
  adb_mutex_unlock(&should_kill_cond_lock);
  D("device_poll_thread should be shutdown\n");
}

void* device_poll_thread(void* _bridge) {
  bridge = (struct dll_bridge *)_bridge;
  D("Created device thread\n");

  int i = 0;
  while(1) {
    int k = get_should_kill();
    if (k) {
      D("Cleaning in timer handler\n");
      notify_should_kill(k, 'D');
      return NULL;
    }

    if(i % 10 == 0) {
      D("In the if-statement");
      find_devices();
      i = 1;
    } else {
      i++;
    }

    adb_sleep_ms(100);
  }

  return NULL;
}

void usb_init(int(*spawnD)()) {
  D("Pre-spawnD\n");
  spawnD();
  D("Post-spawnD\n");
}

void usb_cleanup() {
}

usb_handle* do_usb_open(const wchar_t* interface_name) {
  // Allocate our handle
  usb_handle* ret = (usb_handle*)malloc(sizeof(usb_handle));
  if (NULL == ret)
    return NULL;

  // Set linkers back to the handle
  ret->next = ret;
  ret->prev = ret;

  // Create interface.
  ret->adb_interface = bridge->AdbCreateInterfaceByName(interface_name);

  if (NULL == ret->adb_interface) {
    free(ret);
    errno = GetLastError();
    return NULL;
  }

  // Open read pipe (endpoint)
  ret->adb_read_pipe =
    bridge->AdbOpenDefaultBulkReadEndpoint(ret->adb_interface,
                                   AdbOpenAccessTypeReadWrite,
                                   AdbOpenSharingModeReadWrite);
  if (NULL != ret->adb_read_pipe) {
    // Open write pipe (endpoint)
    ret->adb_write_pipe =
      bridge->AdbOpenDefaultBulkWriteEndpoint(ret->adb_interface,
                                      AdbOpenAccessTypeReadWrite,
                                      AdbOpenSharingModeReadWrite);
    if (NULL != ret->adb_write_pipe) {
      // Save interface name
      unsigned long name_len = 0;

      // First get expected name length
      bridge->AdbGetInterfaceName(ret->adb_interface,
                          NULL,
                          &name_len,
                          true);
      if (0 != name_len) {
        ret->interface_name = (char*)malloc(name_len);

        if (NULL != ret->interface_name) {
          // Now save the name
          if (bridge->AdbGetInterfaceName(ret->adb_interface,
                                  ret->interface_name,
                                  &name_len,
                                  true)) {
            // We're done at this point
            return ret;
          }
        } else {
          SetLastError(ERROR_OUTOFMEMORY);
        }
      }
    }
  }

  // Something went wrong.
  int saved_errno = GetLastError();
  usb_cleanup_handle(ret, bridge->AdbCloseHandle, "bridge1");
  free(ret);
  SetLastError(saved_errno);

  return NULL;
}

int usb_write(usb_handle* handle, const void* data, int len) {
  unsigned long time_out = 5000;
  unsigned long written = 0;
  int ret;

  D("usb_write %d\n", len);
  if (NULL != handle) {
    D("Before bridge->AdbWriteEndpointSync\n");
    // Perform write
    ret = i_bridge->AdbWriteEndpointSync(handle->adb_write_pipe,
                               (void*)data,
                               (unsigned long)len,
                               &written,
                               time_out);
    D("After bridge->AdbWriteEndpointSync\n");
    int saved_errno = GetLastError();

    if (ret) {
      // Make sure that we've written what we were asked to write
      D("usb_write got: %ld, expected: %d\n", written, len);
      if (written == (unsigned long)len) {
        if(handle->zero_mask && (len & handle->zero_mask) == 0) {
          // Send a zero length packet
          i_bridge->AdbWriteEndpointSync(handle->adb_write_pipe,
                               (void*)data,
                               0,
                               &written,
                               time_out);
        }
        return 0;
      }
    } else {
      // assume ERROR_INVALID_HANDLE indicates we are disconnected
      if (saved_errno == ERROR_INVALID_HANDLE)
        usb_kick(handle, i_bridge->AdbCloseHandle);
    }
    errno = saved_errno;
  } else {
    D("usb_write NULL handle\n");
    SetLastError(ERROR_INVALID_HANDLE);
  }

  D("usb_write failed: %d\n", errno);

  return -1;
}

extern THREAD_LOCAL int (*getLastError)();
int usb_read(usb_handle *handle, void* data, int len) {
  unsigned long time_out = 100;
  unsigned long read = 0;
  int ret;
  char * data_ = (char *)data;

  D("usb_read %d\n", len);
  if (NULL != handle) {
    while (len > 0) {
      int xfer = (len > 4096) ? 4096 : len;

      // loop until there is a byte
      int saved_errno = 0;
      do {
        ret = o_bridge->AdbReadEndpointSync(handle->adb_read_pipe,
                                    (void*)data_,
                                    (unsigned long)xfer,
                                    &read,
                                    time_out);
        saved_errno = getLastError();
        D("usb_read got: %ld, expected: %d, errno: %d, ret: %d\n", read, xfer, saved_errno, ret);
        int k = get_should_kill();
        if (k) {
          return -1;
          // the input thread will notify_should_kill
        }
      } while(saved_errno == 121);

      if (ret) {
        data_ += read;
        len -= read;

        if (len == 0)
          return 0;
      } else {
        // NOTE: This is commented out because for a while saved_errno
        //       was always zero and everything worked smoothly
        // assume ERROR_INVALID_HANDLE indicates we are disconnected
        //if (saved_errno == ERROR_INVALID_HANDLE)
        //  usb_kick(handle, o_bridge->AdbCloseHandle);
        break;
      }
      errno = saved_errno;
    }
  } else {
    D("usb_read NULL handle\n");
    SetLastError(ERROR_INVALID_HANDLE);
  }

  D("usb_read failed: %d\n", errno);

  return -1;
}

void usb_cleanup_handle(usb_handle* handle, bool (*close_handle_func)(ADBAPIHANDLE), char * tag) {
  if (NULL != handle) {
    D("Called with tag: %s\n", tag);
    if (NULL != handle->interface_name)
      free(handle->interface_name);
    if (NULL != handle->adb_write_pipe)
      close_handle_func(handle->adb_write_pipe);
    if (NULL != handle->adb_read_pipe)
      close_handle_func(handle->adb_read_pipe);
    if (NULL != handle->adb_interface)
      close_handle_func(handle->adb_interface);

    handle->interface_name = NULL;
    handle->adb_write_pipe = NULL;
    handle->adb_read_pipe = NULL;
    handle->adb_interface = NULL;
  }
}

void usb_kick(usb_handle *handle, bool (*close_handle_func)(ADBAPIHANDLE)) {
  if (NULL != handle) {
    adb_mutex_lock(&usb_lock);

    usb_cleanup_handle(handle, close_handle_func, "usb_kick2");

    adb_mutex_unlock(&usb_lock);
  } else {
    SetLastError(ERROR_INVALID_HANDLE);
    errno = ERROR_INVALID_HANDLE;
  }
}

int usb_close(usb_handle* handle, bool (*close_handle_func)(ADBAPIHANDLE)) {
  D("usb_close\n");

  if (NULL != handle) {
    // Remove handle from the list
    adb_mutex_lock(&usb_lock);

    if ((handle->next != handle) && (handle->prev != handle)) {
      handle->next->prev = handle->prev;
      handle->prev->next = handle->next;
      handle->prev = handle;
      handle->next = handle;
    }

    adb_mutex_unlock(&usb_lock);

    // Cleanup handle
    usb_cleanup_handle(handle, close_handle_func, "usb_close3");
    free(handle);
  }

  return 0;
}

const char *usb_name(usb_handle* handle) {
  if (NULL == handle) {
    SetLastError(ERROR_INVALID_HANDLE);
    errno = ERROR_INVALID_HANDLE;
    return NULL;
  }

  return (const char*)handle->interface_name;
}

int recognized_device(usb_handle* handle) {
  if (NULL == handle)
    return 0;

  // Check vendor and product id first
  USB_DEVICE_DESCRIPTOR device_desc;

  if (!bridge->AdbGetUsbDeviceDescriptor(handle->adb_interface,
                                 &device_desc)) {
    return 0;
  }

  // Then check interface properties
  USB_INTERFACE_DESCRIPTOR interf_desc;

  if (!bridge->AdbGetUsbInterfaceDescriptor(handle->adb_interface,
                                    &interf_desc)) {
    return 0;
  }

  // Must have two endpoints
  if (2 != interf_desc.bNumEndpoints) {
    return 0;
  }

  if (is_adb_interface(device_desc.idVendor, device_desc.idProduct,
      interf_desc.bInterfaceClass, interf_desc.bInterfaceSubClass, interf_desc.bInterfaceProtocol)) {

    if(interf_desc.bInterfaceProtocol == 0x01) {
      AdbEndpointInformation endpoint_info;
      // assuming zero is a valid bulk endpoint ID
      if (bridge->AdbGetEndpointInformation(handle->adb_interface, 0, &endpoint_info)) {
        handle->zero_mask = endpoint_info.max_packet_size - 1;
      }
    }

    return 1;
  }

  return 0;
}

void find_devices() {
        usb_handle* handle = NULL;
  char entry_buffer[2048];
  char interf_name[2048];
  AdbInterfaceInfo* next_interface = (AdbInterfaceInfo*)(&entry_buffer[0]);
  unsigned long entry_buffer_size = sizeof(entry_buffer);
  char* copy_name;

  // Enumerate all present and active interfaces.
  ADBAPIHANDLE enum_handle =
    bridge->AdbEnumInterfaces(usb_class_id, true, true, true);

  if (NULL == enum_handle)
    return;

  while (bridge->AdbNextInterface(enum_handle, next_interface, &entry_buffer_size)) {
    // TODO: FIXME - temp hack converting wchar_t into char.
    // It would be better to change AdbNextInterface so it will return
    // interface name as single char string.
    const wchar_t* wchar_name = next_interface->device_name;
    for(copy_name = interf_name;
        L'\0' != *wchar_name;
        wchar_name++, copy_name++) {
      *copy_name = (char)(*wchar_name);
    }
    *copy_name = '\0';

    // Lets see if we already have this device in the list
    if (!known_device(interf_name)) {
      // This seems to be a new device. Open it!
        handle = do_usb_open(next_interface->device_name);
        if (NULL != handle) {
        // Lets see if this interface (device) belongs to us
        if (recognized_device(handle)) {
          D("adding a new device %s\n", interf_name);
          char serial_number[512];
          unsigned long serial_number_len = sizeof(serial_number);
          if (bridge->AdbGetSerialNumber(handle->adb_interface,
                                serial_number,
                                &serial_number_len,
                                true)) {
            // Lets make sure that we don't duplicate this device
            if (register_new_device(handle)) {
              register_usb_transport(handle, serial_number, NULL, 1);
            } else {
              D("register_new_device failed for %s\n", interf_name);
              usb_cleanup_handle(handle, bridge->AdbCloseHandle, "bridge4");
              free(handle);
            }
          } else {
            D("cannot get serial number\n");
            usb_cleanup_handle(handle, bridge->AdbCloseHandle, "bridge5");
            free(handle);
          }
        } else {
          usb_cleanup_handle(handle, bridge->AdbCloseHandle, "bridge6");
          free(handle);
        }
      }
    }

    entry_buffer_size = sizeof(entry_buffer);
  }

  bridge->AdbCloseHandle(enum_handle);
  
}

#undef D
#define D D_
