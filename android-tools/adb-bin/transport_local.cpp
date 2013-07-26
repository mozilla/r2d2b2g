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

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>

#include "sysdeps.h"
#include <sys/types.h>

#define  TRACE_TAG  TRACE_TRANSPORT
#include "adb.h"

#ifdef HAVE_BIG_ENDIAN
#define H4(x)	(((x) & 0xFF000000) >> 24) | (((x) & 0x00FF0000) >> 8) | (((x) & 0x0000FF00) << 8) | (((x) & 0x000000FF) << 24)
static inline void fix_endians(apacket *p)
{
    p->msg.command     = H4(p->msg.command);
    p->msg.arg0        = H4(p->msg.arg0);
    p->msg.arg1        = H4(p->msg.arg1);
    p->msg.data_length = H4(p->msg.data_length);
    p->msg.data_check  = H4(p->msg.data_check);
    p->msg.magic       = H4(p->msg.magic);
}
#else
#define fix_endians(p) do {} while (0)
#endif

#if ADB_HOST
/* we keep a list of opened transports. The atransport struct knows to which
 * local transport it is connected. The list is used to detect when we're
 * trying to connect twice to a given local transport.
 */
#define  ADB_LOCAL_TRANSPORT_MAX  16

ADB_MUTEX_DEFINE( local_transports_lock );

static atransport*  local_transports[ ADB_LOCAL_TRANSPORT_MAX ];
#endif /* ADB_HOST */

static int remote_read(apacket *p, atransport *t)
{
    if(readx(t->sfd, &p->msg, sizeof(amessage))){
        D("remote local: read terminated (message)\n");
        return -1;
    }

    fix_endians(p);

#if 0 && defined HAVE_BIG_ENDIAN
    D("read remote packet: %04x arg0=%0x arg1=%0x data_length=%0x data_check=%0x magic=%0x\n",
      p->msg.command, p->msg.arg0, p->msg.arg1, p->msg.data_length, p->msg.data_check, p->msg.magic);
#endif
    if(check_header(p)) {
        D("bad header: terminated (data)\n");
        return -1;
    }

    if(readx(t->sfd, p->data, p->msg.data_length)){
        D("remote local: terminated (data)\n");
        return -1;
    }

    if(check_data(p)) {
        D("bad data: terminated (data)\n");
        return -1;
    }

    return 0;
}

static int remote_write(apacket *p, atransport *t)
{
    int   length = p->msg.data_length;

    fix_endians(p);

#if 0 && defined HAVE_BIG_ENDIAN
    D("write remote packet: %04x arg0=%0x arg1=%0x data_length=%0x data_check=%0x magic=%0x\n",
      p->msg.command, p->msg.arg0, p->msg.arg1, p->msg.data_length, p->msg.data_check, p->msg.magic);
#endif
    if(writex(t->sfd, &p->msg, sizeof(amessage) + length)) {
        D("remote local: write terminated\n");
        return -1;
    }

    return 0;
}


int local_connect(int port) {
    return local_connect_arbitrary_ports(port-1, port);
}

int local_connect_arbitrary_ports(int console_port, int adb_port)
{
    char buf[64];
    int  fd = -1;

#if ADB_HOST
    const char *host = getenv("ADBHOST");
    if (host) {
        fd = socket_network_client(host, adb_port, SOCK_STREAM);
    }
#endif
    if (fd < 0) {
        fd = socket_loopback_client(adb_port, SOCK_STREAM);
    }

    if (fd >= 0) {
        D("client: connected on remote on fd %d\n", fd);
        close_on_exec(fd);
        disable_tcp_nagle(fd);
        snprintf(buf, sizeof buf, "%s%d", LOCAL_CLIENT_PREFIX, console_port);
        register_socket_transport(fd, buf, adb_port, 1);
        return 0;
    }
    return -1;
}


static void *client_socket_thread(void *x)
{
#if ADB_HOST
    int  port  = DEFAULT_ADB_LOCAL_TRANSPORT_PORT;
    int  count = ADB_LOCAL_TRANSPORT_MAX;

    D("transport: client_socket_thread() starting\n");

    /* try to connect to any number of running emulator instances     */
    /* this is only done when ADB starts up. later, each new emulator */
    /* will send a message to ADB to indicate that is is starting up  */
    for ( ; count > 0; count--, port += 2 ) {
        (void) local_connect(port);
    }
#endif
    return 0;
}

static void *server_socket_thread(void * arg)
{
    int serverfd, fd;
    struct sockaddr addr;
    socklen_t alen;
    int port = *(int *)arg;

    D("transport: server_socket_thread() starting\n");
    serverfd = -1;
    for(;;) {
        if(serverfd == -1) {
            serverfd = socket_inaddr_any_server(port, SOCK_STREAM);
            if(serverfd < 0) {
                D("server: cannot bind socket yet\n");
                adb_sleep_ms(1000);
                continue;
            }
            close_on_exec(serverfd);
        }

        alen = sizeof(addr);
        D("server: trying to get new connection from %d\n", port);
        fd = adb_socket_accept(serverfd, &addr, &alen);
        if(fd >= 0) {
            D("server: new connection on fd %d\n", fd);
            close_on_exec(fd);
            disable_tcp_nagle(fd);
            register_socket_transport(fd, "host", port, 1);
        }
    }
    D("transport: server_socket_thread() exiting\n");
    return 0;
}

void local_init(int port)
{
    adb_thread_t * thr = (adb_thread_t *)malloc(sizeof(adb_thread_t));
    void* (*func)(void *);

    if(HOST) {
        D("Got client_socket_thread\n");
        func = client_socket_thread;
    } else {
        D("Got server_socket_thread\n");
        func = server_socket_thread;
    }

    D("transport: local %s init\n", HOST ? "client" : "server");

    char tag[1024];
    D("Just before adb_thread_create\n");
    sprintf(tag, "local_socket %s", HOST ? "client" : "server");
    if(adb_thread_create(thr, func, (void *)&port, tag)) {
        fatal_errno("cannot create local socket %s thread",
                    HOST ? "client" : "server");
    }
}

static void remote_kick(atransport *t)
{
    int fd = t->sfd;
    t->sfd = -1;
    adb_shutdown(fd);
    adb_close(fd);

#if ADB_HOST
    if(HOST) {
        int  nn;
        adb_mutex_lock( &local_transports_lock );
        for (nn = 0; nn < ADB_LOCAL_TRANSPORT_MAX; nn++) {
            if (local_transports[nn] == t) {
                local_transports[nn] = NULL;
                break;
            }
        }
        adb_mutex_unlock( &local_transports_lock );
    }
#endif
}

static void remote_close(atransport *t)
{
    adb_close(t->fd);
}


#if ADB_HOST
/* Only call this function if you already hold local_transports_lock. */
atransport* find_emulator_transport_by_adb_port_locked(int adb_port)
{
    int i;
    for (i = 0; i < ADB_LOCAL_TRANSPORT_MAX; i++) {
        if (local_transports[i] && local_transports[i]->adb_port == adb_port) {
            return local_transports[i];
        }
    }
    return NULL;
}

atransport* find_emulator_transport_by_adb_port(int adb_port)
{
    adb_mutex_lock( &local_transports_lock );
    atransport* result = find_emulator_transport_by_adb_port_locked(adb_port);
    adb_mutex_unlock( &local_transports_lock );
    return result;
}

/* Only call this function if you already hold local_transports_lock. */
int get_available_local_transport_index_locked()
{
    int i;
    for (i = 0; i < ADB_LOCAL_TRANSPORT_MAX; i++) {
        if (local_transports[i] == NULL) {
            return i;
        }
    }
    return -1;
}

int get_available_local_transport_index()
{
    adb_mutex_lock( &local_transports_lock );
    int result = get_available_local_transport_index_locked();
    adb_mutex_unlock( &local_transports_lock );
    return result;
}
#endif

int init_socket_transport(atransport *t, int s, int adb_port, int local)
{
    int  fail = 0;

    t->kick = remote_kick;
    t->close = remote_close;
    t->read_from_remote = remote_read;
    t->write_to_remote = remote_write;
    t->sfd = s;
    t->sync_token = 1;
    t->connection_state = CS_OFFLINE;
    t->type = kTransportLocal;
    t->adb_port = 0;

#if ADB_HOST
    if (HOST && local) {
        adb_mutex_lock( &local_transports_lock );
        {
            t->adb_port = adb_port;
            atransport* existing_transport =
                    find_emulator_transport_by_adb_port_locked(adb_port);
            int index = get_available_local_transport_index_locked();
            if (existing_transport != NULL) {
                D("local transport for port %d already registered (%p)?\n",
                adb_port, existing_transport);
                fail = -1;
            } else if (index < 0) {
                // Too many emulators.
                D("cannot register more emulators. Maximum is %d\n",
                        ADB_LOCAL_TRANSPORT_MAX);
                fail = -1;
            } else {
                local_transports[index] = t;
            }
       }
       adb_mutex_unlock( &local_transports_lock );
    }
#endif
    return fail;
}
