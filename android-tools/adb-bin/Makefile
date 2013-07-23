# Makefile for adb; from https://heiher.info/2227.html
# modified again from Ubuntu's android-tools package

ADB_AUTH ?= off

ifeq ($(OS), Windows_NT)
  VS_DEVELOPER_CMD_PATH = vcvars32.bat
  ADB_TARGETS = winlib
else
ADB_TARGETS = adb nixlib

CSRCS+= sockets.c
CPPSRCS+= adb.cpp
CPPSRCS+= adb_client.cpp

CPPSRCS+= file_sync_client.cpp
CPPSRCS+= services.cpp
CPPSRCS+= transport.cpp
CPPSRCS+= transport_local.cpp
CPPSRCS+= transport_usb.cpp
CPPSRCS+= usb_vendors.cpp
CPPSRCS+= utils.cpp
CPPSRCS+= declare_array_lists.cpp

CPPSRCS+= exports.cpp

ifeq ($(shell uname -s), Darwin)
  CPPSRCS+= usb_osx.cpp
  CPPSRCS+= get_my_path_darwin.cpp
  CPPSRCS+= fdevent.cpp
  ifeq ($(ADB_AUTH), static)
    CPPSRCS+= adb_auth_host.cpp
    LIBS+= -lcrypto
  else ifeq ($(ADB_AUTH), dynamic)
    CPPSRCS+= adb_auth_host.cpp
    LIBS+= -lcrypto
  endif
  LIBS+= -lz -lpthread -framework CoreFoundation -framework IOKit -framework Carbon
endif
ifeq ($(shell uname -s), Linux)
  CSRCS+= usb_linux.c
  CSRCS+= get_my_path_linux.c
  CSRCS+= fdevent.c
  ifeq ($(ADB_AUTH), static)
    CPPSRCS+= adb_auth_host.cpp
    LIBS+= -Wl,-Bstatic -lcrypto
  else ifeq ($(ADB_AUTH), dynamic)
    CPPSRCS+= adb_auth_host.cpp
    LIBS+= -Wl,-Bdynamic -lcrypto
  endif
  LIBS+= -Wl,-Bdynamic -lc -lpthread -lz -ldl
  LDFLAGS+= -Wl,-Bsymbolic
endif

VPATH+= ../libcutils
CSRCS+= abort_socket.c
CSRCS+= socket_loopback_client.c
CSRCS+= socket_loopback_server.c
CSRCS+= socket_network_client.c
CSRCS+= socket_inaddr_any_server.c
CSRCS+= load_file.c
CSRCS+= socket_local_client.c
CSRCS+= socket_local_server.c
CSRCS+= list.c

VPATH+= ../libzipfile
CSRCS+= centraldir.c
CSRCS+= zipfile.c

CPPFLAGS+= -x c
CPPFLAGS+= -DADB_HOST=1
CPPFLAGS+= -I.
CPPFLAGS+= -I../include
CPPFLAGS+= -I/usr/include/openssl
CPPFLAGS+= -g3
CPPFLAGS+= -DHAVE_FORKEXEC=1
CPPFLAGS+= -DHAVE_SYMLINKS
CPPFLAGS+= -DHAVE_TERMIO_H
ifeq ($(ADB_AUTH), off)
  CPPFLAGS+= -DNO_AUTH
endif
CPPFLAGS+= -fPIC
CPPFLAGS+= -std=gnu99
ifeq ($(shell getconf LONG_BIT), 64)
  CPPFLAGS+= -m64
else
  CPPFLAGS+= -m32
endif
# CPPFLAGS+= -Wno-deprecated-writable-strings
CPPFLAGS+= -Wno-deprecated-declarations
DLL=.so
endif

OBJS= $(CSRCS:.c=.o) $(CPPSRCS:.cpp=.o)
SRCS= $(CSRCS) $(CPPSRCS)

all: $(ADB_TARGETS)

adb: $(OBJS)
	$(CC) -o adb$(EXE) $(LDFLAGS) $(OBJS) $(LIBS)

clean:
	rm -rf $(OBJS) adb$(EXE) libadb$(DLL)

nixlib: $(OBJS)
	$(CC) -shared -o libadb$(DLL) $(LDFLAGS) $(OBJS) $(LIBS)

winlib:
	echo make-win.bat | cmd $(VS_DEVELOPER_CMD_PATH)

