# Makefile for adb; from https://heiher.info/2227.html
# modified again from Ubuntu's android-tools package

ADB_AUTH ?= off

PACKAGE_FILES = LICENSE README

ifeq ($(OS), Windows_NT)
  VS_DEVELOPER_CMD_PATH = vcvars32.bat
  ADB_TARGETS = winlib
  WINDOWS_ARTIFACTS = ../win-out vc110.idb vc110.pdb ../adb-win-api/api/build*_w*_x86.* \
      ../adb-win-api/api/obj* ../adb-win-api/api/*.idb ../adb-win-api/api/*.pdb \
      ../adb-win-api/winusb/obj* ../adb-win-api/winusb/build*_w*_x86.*
  PACKAGE_FILES += \
    ../win-out/libadb.dll \
    ../adb-win-api/api/obj*/i386/AdbWinApi.dll \
    ../adb-win-api/winusb/obj*/i386/AdbWinUsbApi.dll
else
ADB_TARGETS = adb nixlib
WINDOWS_ARTIFACTS =
DLL=.so
PACKAGE_FILES += libadb$(DLL)

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
CPPSRCS+= js_message.cpp

CPPSRCS+= exports.cpp

ifeq ($(shell uname -s), Darwin)
  CPPFLAGS+= -DHAVE_PTHREADS
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
  CPPFLAGS+= -DHAVE_PTHREADS
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
CSRCS+= threads.c

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
endif

OBJS= $(CSRCS:.c=.o) $(CPPSRCS:.cpp=.o)
SRCS= $(CSRCS) $(CPPSRCS)

TESTSRCS+= test-js-message.c
TESTSRCS+= threads.c
TESTSRCS+= js_message.c
TESTOBJS= $(TESTSRCS:.c=.o)

build: $(ADB_TARGETS)

adb: $(OBJS)
	$(CC) -o adb$(EXE) $(LDFLAGS) $(OBJS) $(LIBS)

clean:
	rm -rf $(OBJS) $(TESTOBJS) test-js-message.obj adb$(EXE) libadb$(DLL) \
	  libtest$(DLL) $(WINDOWS_ARTIFACTS) libadb.zip

nixlib: nixlibadb nixlibtest

nixlibadb: $(OBJS)
	$(CC) -shared -o libadb$(DLL) $(LDFLAGS) $(OBJS) $(LIBS)

nixlibtest: $(TESTOBJS)
	$(CC) -shared -o libtest$(DLL) $(LDFLAGS) $(TESTOBJS) $(LIBS)

winlib: winlibadb winlibtest

winlibadb:
	mkdir -p ../win-out
	echo make-win.bat | cmd $(VS_DEVELOPER_CMD_PATH)

winlibtest:
	echo "cl.exe /DHAVE_WIN32_THREADS /I../include ../libcutils/threads.c js_message.c test-js-message.c /link /DLL /OUT:..\\win-out\\libtest.dll" | cmd $(VS_DEVELOPER_CMD_PATH)

package:
	zip -j libadb.zip $(PACKAGE_FILES)
