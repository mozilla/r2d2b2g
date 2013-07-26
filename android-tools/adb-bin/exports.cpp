/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#define  TRACE_TAG   TRACE_EXPORTS

#include <stdio.h>
#include <stddef.h>
#include <stdlib.h>
#include <signal.h>
#include "adb.h"
#include "adb_client.h"
#include "threads.h"

DLL_EXPORT void cleanup();
DLL_EXPORT char * query(const char * service);
DLL_EXPORT void * malloc_(int size);

DLL_EXPORT int connect_service(const char * service);
DLL_EXPORT int read_fd(int fd, char * buffer, int size);

DLL_EXPORT void install_thread_locals(void (*restart_me)());
DLL_EXPORT void install_js_msg(void *(js_msg)(char *, void *));
DLL_EXPORT void array_lists_init();

DLL_EXPORT int main_server(struct adb_main_input * input_args);

DLL_EXPORT int device_input_thread(atransport *, struct dll_io_bridge *);
DLL_EXPORT int device_output_thread(atransport *, struct dll_io_bridge *);
#ifdef __APPLE__
void DLL_EXPORT kill_device_loop();
#endif
DLL_EXPORT int usb_monitor(struct dll_bridge * bridge);
DLL_EXPORT void on_kill_io_pump(atransport * t, bool (*close_handle_func)(ADBAPIHANDLE));

  DLL_EXPORT void install_thread_locals(void (*restart_me)()) {
    install_thread_locals_(restart_me);
  }

  DLL_EXPORT void install_js_msg(void *(js_msg)(char *, void *)) {
    install_js_msg_(js_msg);
  }

  DLL_EXPORT void install_getLastError(int (*getLastError)()) {
    install_getLastError_(getLastError);
  }

  DLL_EXPORT void array_lists_init() {
    array_lists_init_();
  }

// TODO: Figure out how to malloc straight from js-ctypes on mac osx
  DLL_EXPORT void * malloc_(int size) {
    return malloc(size);
  }

  DLL_EXPORT void free_(void * ptr) {
    free(ptr);
  }

  DLL_EXPORT void cleanup() {
    cleanup_all();
  }

  DLL_EXPORT char * query(const char * service) {
    return adb_query(service);
  }

#ifdef __APPLE__
  DLL_EXPORT void kill_threads() {
    should_kill_device_loop();
  }
#endif
#ifdef WIN32
  DLL_EXPORT void kill_threads() {
    should_kill_threads();
  }
#endif

  DLL_EXPORT void on_kill_io_pump(atransport * t, bool (*close_handle_func)(ADBAPIHANDLE)) {
    kill_io_pump(t, close_handle_func);
  }

  //============================
  // FILE IO
  //============================

  // returns a file descriptor to use with read_fd
  // if < 0, then FAIL
  DLL_EXPORT int connect_service(const char * service) {
    return _adb_connect(service);
  }

  // returns length read (and 0 when done)
  DLL_EXPORT int read_fd(int fd, char * buffer, int size) {
    return adb_read(fd, buffer, size);
  }

  // returns length written (and 0 when done)
  DLL_EXPORT int write_fd(int fd, char * buf, int len) {
    return adb_write(fd, (void *)buf, len);
  }

  //============================
  // SOCKETS
  //============================

  DLL_EXPORT void socket_pipe(int sv[2]) {
    adb_socketpair(sv);
  }

  //============================
  // THREADS
  //============================

  // NOTE: input_args is free'd with `free` so must be alloc'd with malloc.
  //       This call loops forever.
  DLL_EXPORT int main_server(struct adb_main_input * input_args) {
    server_thread((void *)input_args);
    return 0;
  }

#ifdef __APPLE__
  DLL_EXPORT int usb_monitor(struct dll_bridge * unused) {
    return RunLoopThread(NULL);
  }
#endif
// on linux we can safely kill this thread with Worker::terminate
#ifdef __linux__
  DLL_EXPORT int usb_monitor(struct dll_bridge * unused) {
    return device_poll_thread(NULL);
  }
#endif
#ifdef WIN32
  DLL_EXPORT int usb_monitor(struct dll_bridge * bridge) {
    device_poll_thread((void *)bridge);
    return 0;
  }
#endif

  DLL_EXPORT int device_input_thread(atransport * t, struct dll_io_bridge * io_bridge) {
    D("SPAWNED device_input_thread\n");
    input_thread((void *)t, io_bridge);
    return 0;
  }

  DLL_EXPORT int device_output_thread(atransport * t, struct dll_io_bridge * io_bridge) {
    D("SPAWNED device_output_thread\n");
    output_thread((void *)t, io_bridge);
    return 0;
  }

  DLL_EXPORT void should_die_fdevent() {
    #ifdef WIN32
      should_die_fdevent_();
    #endif
  }

