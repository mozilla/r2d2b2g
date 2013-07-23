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

#ifndef __ADB_H
#define __ADB_H

#ifdef __cplusplus
  #define EXTERN_C extern "C"
#else
  #define EXTERN_C
#endif

// some extra visual studios stuff
#ifdef _WIN32
#define ADB_HOST 1
#define snprintf _snprintf
// #define HAVE_WIN32_PROC 1
// #define HAVE_WIN32_IPC 1
// #define HAVE_WINSOCK 1
#define PATH_MAX 4096
#define DLL_EXPORT EXTERN_C _declspec(dllexport)
#define THREAD_LOCAL _declspec(thread)
#else
#define THREAD_LOCAL __thread
#define DLL_EXPORT  
#define Sleep(x) usleep((x) * 1000)
typedef void * ADBAPIHANDLE;
#endif

#include <limits.h>

#include "transport.h"  /* readx(), writex() */
#include "sysdeps.h"

#ifdef WIN32
#include <usb100.h>
#include <adb_api.h>
// for some reason windows doesn't print to stdout or stderr
//    from native code (wtf windows) so make printf log to a file    
extern FILE* LOG_FILE;
#undef printf
#define printf(...) do { fprintf(LOG_FILE, __VA_ARGS__); fflush(LOG_FILE); } while (0); 
#endif

#define MAX_PAYLOAD 4096

#define A_SYNC 0x434e5953
#define A_CNXN 0x4e584e43
#define A_OPEN 0x4e45504f
#define A_OKAY 0x59414b4f
#define A_CLSE 0x45534c43
#define A_WRTE 0x45545257
#define A_AUTH 0x48545541

#define A_VERSION 0x01000000        // ADB protocol version

#define ADB_VERSION_MAJOR 1         // Used for help/version information
#define ADB_VERSION_MINOR 0         // Used for help/version information

#define ADB_SERVER_VERSION    31    // Increment this when we want to force users to start a new adb server

typedef struct amessage amessage;
typedef struct apacket apacket;
typedef struct asocket asocket;
typedef struct alistener alistener;
typedef struct aservice aservice;
typedef struct atransport atransport;
typedef struct adisconnect  adisconnect;
typedef struct usb_handle usb_handle;

struct amessage {
    unsigned command;       /* command identifier constant      */
    unsigned arg0;          /* first argument                   */
    unsigned arg1;          /* second argument                  */
    unsigned data_length;   /* length of payload (0 is allowed) */
    unsigned data_check;    /* checksum of data payload         */
    unsigned magic;         /* command ^ 0xffffffff             */
};

struct apacket
{
    apacket *next;

    unsigned len;
    unsigned char *ptr;

    amessage msg;
    unsigned char data[MAX_PAYLOAD];
};

/* An asocket represents one half of a connection between a local and
** remote entity.  A local asocket is bound to a file descriptor.  A
** remote asocket is bound to the protocol engine.
*/
struct asocket {
        /* chain pointers for the local/remote list of
        ** asockets that this asocket lives in
        */
    asocket *next;
    asocket *prev;

        /* the unique identifier for this asocket
        */
    unsigned id;

        /* flag: set when the socket's peer has closed
        ** but packets are still queued for delivery
        */
    int    closing;

        /* flag: quit adbd when both ends close the
        ** local service socket
        */
    int    exit_on_close;

        /* the asocket we are connected to
        */

    asocket *peer;

        /* For local asockets, the fde is used to bind
        ** us to our fd event system.  For remote asockets
        ** these fields are not used.
        */
    fdevent fde;
    int fd;

        /* queue of apackets waiting to be written
        */
    apacket *pkt_first;
    apacket *pkt_last;

        /* enqueue is called by our peer when it has data
        ** for us.  It should return 0 if we can accept more
        ** data or 1 if not.  If we return 1, we must call
        ** peer->ready() when we once again are ready to
        ** receive data.
        */
    int (*enqueue)(asocket *s, apacket *pkt);

        /* ready is called by the peer when it is ready for
        ** us to send data via enqueue again
        */
    void (*ready)(asocket *s);

        /* close is called by the peer when it has gone away.
        ** we are not allowed to make any further calls on the
        ** peer once our close method is called.
        */
    void (*close)(asocket *s);

        /* socket-type-specific extradata */
    void *extra;

    	/* A socket is bound to atransport */
    atransport *transport;

      /* a tag denoting the type of the socket (for debugging) */
    char * tag;
};


/* the adisconnect structure is used to record a callback that
** will be called whenever a transport is disconnected (e.g. by the user)
** this should be used to cleanup objects that depend on the
** transport (e.g. remote sockets, listeners, etc...)
*/
struct  adisconnect
{
    void        (*func)(void*  opaque, atransport*  t);
    void*         opaque;
    adisconnect*  next;
    adisconnect*  prev;
};


/* a transport object models the connection to a remote device or emulator
** there is one transport per connected device/emulator. a "local transport"
** connects through TCP (for the emulator), while a "usb transport" through
** USB (for real devices)
**
** note that kTransportHost doesn't really correspond to a real transport
** object, it's a special value used to indicate that a client wants to
** connect to a service implemented within the ADB server itself.
*/
typedef enum transport_type {
        kTransportUsb,
        kTransportLocal,
        kTransportAny,
        kTransportHost,
} transport_type;

#define TOKEN_SIZE 20

struct atransport
{
    atransport *next;
    atransport *prev;

    int (*read_from_remote)(apacket *p, atransport *t);
    int (*write_to_remote)(apacket *p, atransport *t);
    void (*close)(atransport *t);
    void (*kick)(atransport *t);

    bool (*close_handle_func)(ADBAPIHANDLE);

    int fd;
    int transport_socket;
    fdevent transport_fde;
    int ref_count;
    unsigned sync_token;
    int connection_state;
    int online;
    transport_type type;

        /* usb handle or socket fd as needed */
    usb_handle *usb;
    int sfd;

        /* used to identify transports for clients */
    char *serial;
    char *product;
    char *model;
    char *device;
    char *devpath;
    int adb_port; // Use for emulators (local transport)

        /* a list of adisconnect callbacks called when the transport is kicked */
    int          kicked;
    adisconnect  disconnects;

    void *key;
    unsigned char token[TOKEN_SIZE];
    fdevent auth_fde;
    unsigned failed_auth_attempts;
};


/* A listener is an entity which binds to a local port
** and, upon receiving a connection on that port, creates
** an asocket to connect the new local connection to a
** specific remote service.
**
** TODO: some listeners read from the new connection to
** determine what exact service to connect to on the far
** side.
*/
struct alistener
{
    alistener *next;
    alistener *prev;

    fdevent fde;
    int fd;

    const char *local_name;
    const char *connect_to;
    atransport *transport;
    adisconnect  disconnect;
};

struct adb_main_input {
  int is_daemon;
  int server_port;
  int is_lib_call;

  // listen to this file-descriptor and die when it is written to
  int exit_fd;

  void (*on_track_ready)();

  int (*spawnIO)(atransport*);
  int (*spawnD)();

  // this is a string pointing to a valid path for the adb.log
  // because windows won't printf to stdout
  char * log_path;
};

typedef struct tmsg tmsg;
struct tmsg
{
    atransport *transport;
    int         action;
};

// a function carrier for a CFRunLoopTimerCallback
struct func_carrier {
  int (*should_kill)(void);
};

#include "array_lists.h"

#ifdef WIN32
struct dll_io_bridge {
  ADBAPIHANDLE (*AdbReadEndpointAsync)(void *, unsigned long, unsigned long *, unsigned long, HANDLE);
  ADBAPIHANDLE (*AdbWriteEndpointAsync)(ADBAPIHANDLE, void *, unsigned long, unsigned long *, unsigned long, HANDLE);
  bool (*AdbReadEndpointSync)(ADBAPIHANDLE, void *, unsigned long, unsigned long *, unsigned long);
  bool (*AdbWriteEndpointSync)(ADBAPIHANDLE, void *, unsigned long, unsigned long *, unsigned long);
  bool (*AdbCloseHandle)(ADBAPIHANDLE);
};

struct dll_bridge {
  ADBAPIHANDLE (*AdbEnumInterfaces)(GUID, bool, bool, bool);
  ADBAPIHANDLE (*AdbCreateInterfaceByName)(const wchar_t *);
  ADBAPIHANDLE (*AdbCreateInterface)(GUID, unsigned short, unsigned short, unsigned char);
  bool (*AdbGetInterfaceName)(ADBAPIHANDLE, void *, unsigned long *, bool);
  bool (*AdbGetSerialNumber)(ADBAPIHANDLE, void *, unsigned long *, bool);
  bool (*AdbGetUsbDeviceDescriptor)(ADBAPIHANDLE, USB_DEVICE_DESCRIPTOR *);
  bool (*AdbGetUsbConfigurationDescriptor)(ADBAPIHANDLE, USB_CONFIGURATION_DESCRIPTOR *);
  bool (*AdbGetUsbInterfaceDescriptor)(ADBAPIHANDLE, USB_INTERFACE_DESCRIPTOR *);
  bool (*AdbGetEndpointInformation)(ADBAPIHANDLE, unsigned char, AdbEndpointInformation *);
  bool (*AdbGetDefaultBulkReadEndpointInformation)(ADBAPIHANDLE, AdbEndpointInformation *);
  bool (*AdbGetDefaultBulkWriteEndpointInformation)(ADBAPIHANDLE, AdbEndpointInformation *);
  ADBAPIHANDLE (*AdbOpenEndpoint)(ADBAPIHANDLE, unsigned char, AdbOpenAccessType, AdbOpenSharingMode);
  ADBAPIHANDLE (*AdbOpenDefaultBulkReadEndpoint)(ADBAPIHANDLE, AdbOpenAccessType, AdbOpenSharingMode);
  ADBAPIHANDLE (*AdbOpenDefaultBulkWriteEndpoint)(ADBAPIHANDLE, AdbOpenAccessType, AdbOpenSharingMode);
  ADBAPIHANDLE (*AdbGetEndpointInterface)(ADBAPIHANDLE);
  bool (*AdbQueryInformationEndpoint)(ADBAPIHANDLE, AdbEndpointInformation *);
  bool (*AdbGetOvelappedIoResult)(ADBAPIHANDLE, LPOVERLAPPED, unsigned long *, bool);
  bool (*AdbHasOvelappedIoComplated)(ADBAPIHANDLE);
  bool (*AdbCloseHandle)(ADBAPIHANDLE);
  bool (*AdbNextInterface)(ADBAPIHANDLE, AdbInterfaceInfo *, unsigned long *);
};
#else
struct dll_bridge { };
struct dll_io_bridge { };
#endif

#ifdef WIN32
  void notify_should_kill(int k, char who);
  int get_io_pump_status();
  void should_kill_threads();
#endif
#ifdef __APPLE__
  void should_kill_device_loop();
#endif
void array_lists_init_();
void install_thread_locals_(void (*restart_me_)());
void install_getLastError_(int (*getLastError)());
int adb_thread_create( adb_thread_t  *thread, adb_thread_func_t  start, void*  arg, char * tag );
void dump_thread_tag();
int get_guid();
void cleanup_all(void);
void cleanup_transport(void);

void kill_io_pump(atransport * t, bool (*close_handle_func)(ADBAPIHANDLE));

void print_packet(const char *label, apacket *p);

asocket *find_local_socket(unsigned id);
void install_local_socket(asocket *s);
void remove_socket(asocket *s);
void close_all_sockets(atransport *t);

#define  LOCAL_CLIENT_PREFIX  "emulator-"

asocket *create_local_socket(int fd);
asocket *create_local_service_socket(const char *destination);

asocket *create_remote_socket(unsigned id, atransport *t);
void connect_to_remote(asocket *s, const char *destination);
void connect_to_smartsocket(asocket *s);

void fatal(const char *fmt, ...);
void fatal_errno(const char *fmt, ...);

void handle_packet(apacket *p, atransport *t);
void send_packet(apacket *p, atransport *t);

void get_my_path(char *s, size_t maxLen);
int launch_server(int server_port);
int adb_main(int is_daemon, int server_port, int is_lib_call);


/* transports are ref-counted
** get_device_transport does an acquire on your behalf before returning
*/
void init_transport_registration(int (*spawnIO)(atransport*));
int  list_transports(char *buf, size_t  bufsize, int long_listing);
void update_transports(void);

asocket*  create_device_tracker(void);

/* Obtain a transport from the available transports.
** If state is != CS_ANY, only transports in that state are considered.
** If serial is non-NULL then only the device with that serial will be chosen.
** If no suitable transport is found, error is set.
*/
atransport *acquire_one_transport(int state, transport_type ttype, const char* serial, char **error_out);
void   add_transport_disconnect( atransport*  t, adisconnect*  dis );
void   remove_transport_disconnect( atransport*  t, adisconnect*  dis );
void   run_transport_disconnects( atransport*  t );
void   kick_transport( atransport*  t, bool(*close_handle_func)(ADBAPIHANDLE) );

/* initialize a transport object's func pointers and state */
#if ADB_HOST
int get_available_local_transport_index();
#endif
int  init_socket_transport(atransport *t, int s, int port, int local);
void init_usb_transport(atransport *t, usb_handle *usb, int state);

/* for MacOS X cleanup */
void close_usb_devices();

/* cause new transports to be init'd and added to the list */
void register_socket_transport(int s, const char *serial, int port, int local);

/* these should only be used for the "adb disconnect" command */
void unregister_transport(atransport *t);
void unregister_all_tcp_transports();

void register_usb_transport(usb_handle *h, const char *serial, const char *devpath, unsigned writeable);

/* this should only be used for transports with connection_state == CS_NOPERM */
void unregister_usb_transport(usb_handle *usb);

atransport *find_transport(const char *serial);
#if ADB_HOST
atransport* find_emulator_transport_by_adb_port(int adb_port);
#endif

int service_to_fd(const char *name);
#if ADB_HOST
asocket *host_service_to_socket(const char*  name, const char *serial);
#endif

/* packet allocator */
apacket *get_apacket(void);
void put_apacket(apacket *p);

int check_header(apacket *p);
int check_data(apacket *p);

/* define ADB_TRACE to 1 to enable tracing support, or 0 to disable it */

#define  ADB_TRACE    1

/* IMPORTANT: if you change the following list, don't
 * forget to update the corresponding 'tags' table in
 * the adb_trace_init() function implemented in adb.c
 */
typedef enum {
    TRACE_ADB = 0,   /* 0x001 */
    TRACE_SOCKETS,
    TRACE_PACKETS,
    TRACE_TRANSPORT,
    TRACE_RWX,       /* 0x010 */
    TRACE_USB,
    TRACE_SYNC,
    TRACE_SYSDEPS,
    TRACE_JDWP,      /* 0x100 */
    TRACE_SERVICES,
    TRACE_AUTH,
    TRACE_EXPORTS
} AdbTrace;

#if ADB_TRACE

  extern int     adb_trace_mask;
  extern unsigned char    adb_trace_output_count;
  void    adb_trace_init(void);

#  define ADB_TRACING  ((adb_trace_mask & (1 << TRACE_TAG)) != 0)

  /* you must define TRACE_TAG before using this macro */
#  define  D(...)                                      \
        do {                                           \
            if (ADB_TRACING) {                         \
                int save_errno = errno;                \
                adb_mutex_lock(&D_lock);               \
                fprintf(stderr, "%s::%s():",           \
                        __FILE__, __FUNCTION__);       \
                errno = save_errno;                    \
                fprintf(stderr, __VA_ARGS__ );         \
                fflush(stderr);                        \
                adb_mutex_unlock(&D_lock);             \
                errno = save_errno;                    \
           }                                           \
        } while (0)
#  define  DR(...)                                     \
        do {                                           \
            if (ADB_TRACING) {                         \
                int save_errno = errno;                \
                adb_mutex_lock(&D_lock);               \
                errno = save_errno;                    \
                fprintf(stderr, __VA_ARGS__ );         \
                fflush(stderr);                        \
                adb_mutex_unlock(&D_lock);             \
                errno = save_errno;                    \
           }                                           \
        } while (0)
#else
#  define  D(...)          ((void)0)
#  define  DR(...)         ((void)0)
#  define  ADB_TRACING     0
#endif


#if !DEBUG_PACKETS
#define print_packet(tag,p) do {} while (0)
#endif

#if ADB_HOST_ON_TARGET
/* adb and adbd are coexisting on the target, so use 5038 for adb
 * to avoid conflicting with adbd's usage of 5037
 */
#  define DEFAULT_ADB_PORT 5038
#else
#  define DEFAULT_ADB_PORT 5037
#endif

#define DEFAULT_ADB_LOCAL_TRANSPORT_PORT 5555

#define ADB_CLASS              0xff
#define ADB_SUBCLASS           0x42
#define ADB_PROTOCOL           0x1


void local_init(int port);
int  local_connect(int  port);
int  local_connect_arbitrary_ports(int console_port, int adb_port);

/* usb host/client interface */
void usb_init(int(*spawnD)());
void usb_cleanup();
int usb_write(usb_handle *h, const void *data, int len);
int usb_read(usb_handle *h, void *data, int len);
#ifdef WIN32
void usb_kick(usb_handle *h, bool (*close_handle_func)(ADBAPIHANDLE));
int usb_close(usb_handle *h, bool (*close_handle_func)(ADBAPIHANDLE));
#else
void usb_kick(usb_handle *h);
int usb_close(usb_handle *h);
#endif

/* used for USB device detection */
#if ADB_HOST
int is_adb_interface(int vid, int pid, int usb_class, int usb_subclass, int usb_protocol);
#endif

unsigned host_to_le32(unsigned n);
int adb_commandline(int argc, char **argv);

int connection_state(atransport *t);

#define CS_ANY       -1
#define CS_OFFLINE    0
#define CS_BOOTLOADER 1
#define CS_DEVICE     2
#define CS_HOST       3
#define CS_RECOVERY   4
#define CS_NOPERM     5 /* Insufficient permissions to communicate with the device */
#define CS_SIDELOAD   6

extern int HOST;
extern int SHELL_EXIT_NOTIFY_FD;

#define CHUNK_SIZE (64*1024)

int sendfailmsg(int fd, const char *reason);
int handle_host_request(char *service, transport_type ttype, char* serial, int reply_fd, asocket *s);

#endif
