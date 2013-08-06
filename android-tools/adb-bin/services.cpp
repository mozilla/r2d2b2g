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

#include <stdlib.h>
#include <stdio.h>
#ifndef WIN32
#include <unistd.h>
#endif
#include <string.h>
#include <errno.h>

#include "sysdeps.h"

#define  TRACE_TAG  TRACE_SERVICES
#include "adb.h"
#include "file_sync_service.h"

#if ADB_HOST
#  ifndef HAVE_WINSOCK
#    include <netinet/in.h>
#    include <netdb.h>
#    include <sys/ioctl.h>
#  endif
#else
#  include <cutils/android_reboot.h>
#endif

typedef struct stinfo stinfo;

struct stinfo {
    void (*func)(int fd, void *cookie);
    int fd;
    void *cookie;
};


void *service_bootstrap_func(void *x)
{
    stinfo *sti = (stinfo *)x;
    sti->func(sti->fd, sti->cookie);
    free(sti);
    return 0;
}

#if ADB_HOST
ADB_MUTEX_DEFINE( dns_lock );

static void dns_service(int fd, void *cookie)
{
    char *hostname = (char *)cookie;
    struct hostent *hp;
    unsigned zero = 0;

    adb_mutex_lock(&dns_lock);
    hp = gethostbyname(hostname);
    free(cookie);
    if(hp == 0) {
        writex(fd, &zero, 4);
    } else {
        writex(fd, hp->h_addr, 4);
    }
    adb_mutex_unlock(&dns_lock);
    adb_close(fd);
}
#else
extern int recovery_mode;

static void recover_service(int s, void *cookie)
{
    unsigned char buf[4096];
    unsigned count = (unsigned) cookie;
    int fd;

    fd = adb_creat("/tmp/update", 0644);
    if(fd < 0) {
        adb_close(s);
        return;
    }

    while(count > 0) {
        unsigned xfer = (count > 4096) ? 4096 : count;
        if(readx(s, buf, xfer)) break;
        if(writex(fd, buf, xfer)) break;
        count -= xfer;
    }

    if(count == 0) {
        writex(s, "OKAY", 4);
    } else {
        writex(s, "FAIL", 4);
    }
    adb_close(fd);
    adb_close(s);

    fd = adb_creat("/tmp/update.begin", 0644);
    adb_close(fd);
}

void restart_root_service(int fd, void *cookie)
{
    char buf[100];
    char value[PROPERTY_VALUE_MAX];

    if (getuid() == 0) {
        snprintf(buf, sizeof(buf), "adbd is already running as root\n");
        writex(fd, buf, strlen(buf));
        adb_close(fd);
    } else {
        property_get("ro.debuggable", value, "");
        if (strcmp(value, "1") != 0) {
            snprintf(buf, sizeof(buf), "adbd cannot run as root in production builds\n");
            writex(fd, buf, strlen(buf));
            adb_close(fd);
            return;
        }

        property_set("service.adb.root", "1");
        snprintf(buf, sizeof(buf), "restarting adbd as root\n");
        writex(fd, buf, strlen(buf));
        adb_close(fd);
    }
}

void restart_tcp_service(int fd, void *cookie)
{
    char buf[100];
    char value[PROPERTY_VALUE_MAX];
    int port = (int)cookie;

    if (port <= 0) {
        snprintf(buf, sizeof(buf), "invalid port\n");
        writex(fd, buf, strlen(buf));
        adb_close(fd);
        return;
    }

    snprintf(value, sizeof(value), "%d", port);
    property_set("service.adb.tcp.port", value);
    snprintf(buf, sizeof(buf), "restarting in TCP mode port: %d\n", port);
    writex(fd, buf, strlen(buf));
    adb_close(fd);
}

void restart_usb_service(int fd, void *cookie)
{
    char buf[100];

    property_set("service.adb.tcp.port", "0");
    snprintf(buf, sizeof(buf), "restarting in USB mode\n");
    writex(fd, buf, strlen(buf));
    adb_close(fd);
}

void reboot_service(int fd, void *arg)
{
    char buf[100];
    int pid, ret;

    sync();

    /* Attempt to unmount the SD card first.
     * No need to bother checking for errors.
     */
    pid = fork();
    if (pid == 0) {
        /* ask vdc to unmount it */
        execl("/system/bin/vdc", "/system/bin/vdc", "volume", "unmount",
                getenv("EXTERNAL_STORAGE"), "force", NULL);
    } else if (pid > 0) {
        /* wait until vdc succeeds or fails */
        waitpid(pid, &ret, 0);
    }

    ret = android_reboot(ANDROID_RB_RESTART2, 0, (char *) arg);
    if (ret < 0) {
        snprintf(buf, sizeof(buf), "reboot failed: %s\n", strerror(errno));
        writex(fd, buf, strlen(buf));
    }
    free(arg);
    adb_close(fd);
}

#endif

#if 0
static void echo_service(int fd, void *cookie)
{
    char buf[4096];
    int r;
    char *p;
    int c;

    for(;;) {
        r = adb_read(fd, buf, 4096);
        if(r == 0) goto done;
        if(r < 0) {
            if(errno == EINTR) continue;
            else goto done;
        }

        c = r;
        p = buf;
        while(c > 0) {
            r = write(fd, p, c);
            if(r > 0) {
                c -= r;
                p += r;
                continue;
            }
            if((r < 0) && (errno == EINTR)) continue;
            goto done;
        }
    }
done:
    close(fd);
}
#endif

static int create_service_thread(void (*func)(int, void *), void *cookie)
{
    stinfo *sti;
    adb_thread_t *t = (adb_thread_t *)malloc(sizeof(adb_thread_t));
    int s[2];

    if(adb_socketpair(s)) {
        printf("cannot create service socket pair\n");
        return -1;
    }

    sti = (stinfo *)malloc(sizeof(stinfo));
    if(sti == 0) fatal("cannot allocate stinfo");
    sti->func = func;
    sti->cookie = cookie;
    sti->fd = s[1];

    if(adb_thread_create( t, service_bootstrap_func, sti, "service" )){
        free(sti);
        adb_close(s[0]);
        adb_close(s[1]);
        printf("cannot create service thread\n");
        return -1;
    }

    D("service thread started, %d:%d\n",s[0], s[1]);
    return s[0];
}

#if ADB_HOST
#define SHELL_COMMAND "/bin/sh"
#else
#define SHELL_COMMAND "/system/bin/sh"
#endif

int service_to_fd(const char *name)
{
    int ret = -1;

    if(!strncmp(name, "tcp:", 4)) {
        int port = atoi(name + 4);
        name = strchr(name + 4, ':');
        if(name == 0) {
            ret = socket_loopback_client(port, SOCK_STREAM);
            if (ret >= 0)
                disable_tcp_nagle(ret);
        } else {
            adb_mutex_lock(&dns_lock);
            ret = socket_network_client(name + 1, port, SOCK_STREAM);
            adb_mutex_unlock(&dns_lock);
        }
#ifndef HAVE_WINSOCK   /* winsock doesn't implement unix domain sockets */
    } else if(!strncmp(name, "local:", 6)) {
        ret = socket_local_client(name + 6,
                ANDROID_SOCKET_NAMESPACE_RESERVED, SOCK_STREAM);
    } else if(!strncmp(name, "localreserved:", 14)) {
        ret = socket_local_client(name + 14,
                ANDROID_SOCKET_NAMESPACE_RESERVED, SOCK_STREAM);
    } else if(!strncmp(name, "localabstract:", 14)) {
        ret = socket_local_client(name + 14,
                ANDROID_SOCKET_NAMESPACE_ABSTRACT, SOCK_STREAM);
    } else if(!strncmp(name, "localfilesystem:", 16)) {
        ret = socket_local_client(name + 16,
                ANDROID_SOCKET_NAMESPACE_FILESYSTEM, SOCK_STREAM);
#endif
    } else if(!strncmp("dns:", name, 4)){
        char *n = strdup(name + 4);
        if(n == 0) return -1;
        ret = create_service_thread(dns_service, n);
#if 0
    } else if(!strncmp(name, "echo:", 5)){
        ret = create_service_thread(echo_service, 0);
#endif
    }
    if (ret >= 0) {
        close_on_exec(ret);
    }
    return ret;
}

#if ADB_HOST
struct state_info {
    transport_type transport;
    char* serial;
    int state;
};

static void wait_for_state(int fd, void* cookie)
{
    struct state_info* sinfo = (struct state_info *)cookie;
    char* err = "unknown error";

    D("wait_for_state %d\n", sinfo->state);

    atransport *t = acquire_one_transport(sinfo->state, sinfo->transport, sinfo->serial, &err);
    if(t != 0) {
        writex(fd, "OKAY", 4);
    } else {
        sendfailmsg(fd, err);
    }

    if (sinfo->serial)
        free(sinfo->serial);
    free(sinfo);
    adb_close(fd);
    D("wait_for_state is done\n");
}
#endif

#if ADB_HOST
asocket*  host_service_to_socket(const char*  name, const char *serial)
{
    if (!strcmp(name,"track-devices")) {
        printf("the track-devices service is disabled. Listen for the \"device-update\" channel\n");
        return NULL;
    } else if (!strncmp(name, "wait-for-", strlen("wait-for-"))) {
        struct state_info* sinfo = (struct state_info *)malloc(sizeof(struct state_info));

        if (serial)
            sinfo->serial = strdup(serial);
        else
            sinfo->serial = NULL;

        name += strlen("wait-for-");

        if (!strncmp(name, "local", strlen("local"))) {
            sinfo->transport = kTransportLocal;
            sinfo->state = CS_DEVICE;
        } else if (!strncmp(name, "usb", strlen("usb"))) {
            sinfo->transport = kTransportUsb;
            sinfo->state = CS_DEVICE;
        } else if (!strncmp(name, "any", strlen("any"))) {
            sinfo->transport = kTransportAny;
            sinfo->state = CS_DEVICE;
        } else {
            free(sinfo);
            return NULL;
        }

        int fd = create_service_thread(wait_for_state, sinfo);
        return create_local_socket(fd);
    }
    return NULL;
}
#endif /* ADB_HOST */
