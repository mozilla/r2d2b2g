.PHONY: build clean profile prosthesis b2g adb locales run package test help

-include local.mk

SYS = $(shell uname -s)
ARCH = $(shell uname -m)
ifneq (,$(findstring MINGW32_,$(SYS)))
SYS = WINNT
endif

DOWNLOAD_CMD = wget -c

# The platform of the B2G build.
# Options include 'win32', 'mac64', 'linux64', and 'linux', and the default is
# the current platform.  The reliability of this option is unclear.  Setting it
# to 'mac64' on non-Mac is known to fail, because mozinstall doesn't know how to
# install from a DMG on a non-Mac platform.  But setting it to one of the Linux
# values on the other Linux platform works and is the main use case for it
# (i.e. to create the dual-binary Linux packages).
ifndef B2G_PLATFORM
  ifeq (WINNT, $(SYS))
    B2G_PLATFORM = win32
  else
  ifeq (Darwin, $(SYS))
    B2G_PLATFORM = mac64
  else
  ifeq (Linux, $(SYS))
    ifeq (x86_64, $(ARCH))
      B2G_PLATFORM = linux64
    else
      B2G_PLATFORM = linux
    endif
  endif
  endif
  endif
endif

# The type of the B2G build.  It can be "nightly", in which case you may set
# B2G_ID to the ID of the build (default: the most recent nightly build);
# or "specific", in which case you must set B2G_URL to the URL of the build.
B2G_TYPE ?= specific

# The ID of the nightly B2G build.
# Sometimes this is based on the latest stable nightly for Unagi according to
# https://releases.mozilla.com/b2g/promoted_to_stable/ (private URL).
# B2G_ID

B2G_URL_BASE = https://ftp.mozilla.org/pub/mozilla.org/labs/r2d2b2g/

LIBADB_VERSION = 0.1

# The location of libadb for making ADB. Set this variable to "local" to build 
# libadb.{so, dll} from source locally. Set to "remote" to grab prebuilt ADB 
# binaries from the FTP server.
LIBADB_LOCATION ?= remote

# This variable determines whether or not ADB is built with crypto support
# The values are "off" (crypto is disabled) or "dynamic" (crypto is enabled
# and linked dynamically) or "static" (crypto is enabled and linked statically 
# on linux)
ADB_AUTH ?= off
export ADB_AUTH

# Currently, all B2G builds are custom so we can optimize for code size and fix
# bugs in B2G or its nightly build environments (like 844047 and 815805).

# Platform-specific Defines
ifeq (win32, $(B2G_PLATFORM))
  # The URL of the specific B2G build.
  B2G_URL ?= $(B2G_URL_BASE)b2g-18.0.2013-07-17.en-US.win32.zip

  ADB_PACKAGE = libadb-$(LIBADB_VERSION)-windows.zip
  DEPS = AdbWinApi.dll
  ADB_BINARIES = libadb.dll $(DEPS)
  LIB_SUFFIX = .dll

  ADB_OUT_DIR = android-tools/win-out/
else
ifeq (mac64, $(B2G_PLATFORM))
  B2G_URL ?= $(B2G_URL_BASE)b2g-18.0.2013-07-17.en-US.mac64.dmg

  ADB_PACKAGE = libadb-$(LIBADB_VERSION)-mac.zip
  ADB_BINARIES = libadb.so
  LIB_SUFFIX = .so

  DOWNLOAD_CMD = /usr/bin/curl -O
  ADB_OUT_DIR = android-tools/adb-bin/
else
ifeq (linux64, $(B2G_PLATFORM))
  B2G_URL ?= $(B2G_URL_BASE)b2g-18.0.2013-07-17.en-US.linux-x86_64.tar.bz2

  ADB_PACKAGE = libadb-$(LIBADB_VERSION)-linux64.zip
  ADB_BINARIES = libadb.so
  LIB_SUFFIX = .so
  ADB_OUT_DIR = android-tools/adb-bin/
else
ifeq (linux, $(B2G_PLATFORM))
  B2G_URL ?= $(B2G_URL_BASE)b2g-18.0.2013-07-17.en-US.linux-i686.tar.bz2

  ADB_PACKAGE = libadb-$(LIBADB_VERSION)-linux.zip
  ADB_BINARIES = libadb.so
  LIB_SUFFIX = .so
  ADB_OUT_DIR = android-tools/adb-bin/
endif
endif
endif
endif

ADB_URL_BASE = $(B2G_URL_BASE)
ADB_URL ?= $(ADB_URL_BASE)$(ADB_PACKAGE)

ifdef B2G_PLATFORM
  B2G_PLATFORM_ARG = --platform $(B2G_PLATFORM)
endif

ifdef B2G_TYPE
  B2G_TYPE_ARG = --type $(B2G_TYPE)
endif

ifdef B2G_ID
  B2G_ID_ARG = --id $(B2G_ID)
endif

ifdef B2G_URL
  B2G_URL_ARG = --url $(B2G_URL)
endif

ifdef BIN
  BIN_ARG = -b $(BIN)
endif

ifdef PROFILE
  PROFILE_ARG = --profiledir $(PROFILE)
endif

ifdef TEST
  TEST_ARG = -f $(TEST)
endif

unix_to_windows_path = \
  $(shell echo '$(1)' | sed 's/^\///' | sed 's/\//\\/g' | sed 's/^./\0:/')
# windows_to_unix_path = \
#   $(shell echo '$(1)' | sed 's/\\/\//g' | sed 's/://')

ifneq ($(strip $(LOCALES_FILE)),)
  export LOCALE_BASEDIR ?= $(PWD)/gaia-l10n

  # Gaia expects these to be Windows-style paths on Windows.
  ifeq (win32, $(B2G_PLATFORM))
    LOCALES_FILE := $(call unix_to_windows_path,$(LOCALES_FILE))
    LOCALE_BASEDIR := $(call unix_to_windows_path,$(LOCALE_BASEDIR))
  endif
endif

build: profile b2g adb

clean:
	rm -rf addon/data/$(B2G_PLATFORM)
	rm -rf addon/template
	rm -f gaia/build/custom-prefs.js
	rm -f gaia/build/custom-settings.json
	rm -f $(ADB_PACKAGE)
	make -C gaia clean
	python build/make-b2g.py $(B2G_TYPE_ARG) $(B2G_PLATFORM_ARG) $(B2G_ID_ARG) $(B2G_URL_ARG) --clean
	make -C android-tools clean

profile:
	cp build/override-prefs.js gaia/build/custom-prefs.js
	cp build/override-settings.json gaia/build/custom-settings.json
	NOFTU=1 GAIA_APP_SRCDIRS=apps make -C gaia
	DESKTOP=1 NOFTU=1 GAIA_APP_SRCDIRS=apps make -C gaia preferences
	python build/override-webapps.py
	cd gaia/tools/extensions/desktop-helper/ && zip -r ../../../profile/extensions/desktop-helper\@gaiamobile.org.xpi *
	cd gaia/tools/extensions/activities/ && zip -r ../../../profile/extensions/activities\@gaiamobile.org.xpi *
	rm -rf gaia/profile/startupCache
	rm -rf addon/template
	mkdir -p addon/template
	mv gaia/profile addon/template/
	cp addon-sdk/app-extension/bootstrap.js addon/template/
	cp addon-sdk/app-extension/install.rdf addon/template/
	mkdir -p addon/template/profile/extensions
	cd prosthesis && zip -r b2g-prosthesis\@mozilla.org.xpi content components defaults locale modules chrome.manifest install.rdf
	mv prosthesis/b2g-prosthesis@mozilla.org.xpi addon/template/profile/extensions

# The 'prosthesis' target was folded into the 'profile' target, so it is just
# an alias to that target now.
prosthesis: profile

b2g:
	python build/make-b2g.py $(B2G_TYPE_ARG) $(B2G_PLATFORM_ARG) $(B2G_ID_ARG) $(B2G_URL_ARG)

# We used to store the binaries in the B2G_PLATFORM/ directory, whereas
# now we store them in B2G_PLATFORM/adb/, which happens to be the same
# as the names of the executables on Mac and Linux; so we need to remove
# the executables from B2G_PLATFORM/ before creating B2G_PLATFORM/adb/.
#
# * prepare the adb folders
# * if the zip doesn't exist and either libadb is remote or we depend on
#   something from this zip (i.e. Windows)
#   Download the zip
# * if there exists a zip, unzip it
# * if we are installing locally, run the build command
adb:
	mkdir -p addon/data/$(B2G_PLATFORM)
	cd addon/data/$(B2G_PLATFORM) && rm -rf adb $(ADB_BINARIES)
	mkdir addon/data/$(B2G_PLATFORM)/adb
	if [ ! -f $(ADB_PACKAGE) ] && \
		 ( [ "$(LIBADB_LOCATION)" = "remote" ] || [ $(DEPS) ] ); then \
	  $(DOWNLOAD_CMD) $(ADB_URL); \
	fi;
	if [ -f $(ADB_PACKAGE) ]; then \
	  unzip $(ADB_PACKAGE) -d addon/data/$(B2G_PLATFORM)/adb; \
	fi;
	if [ "$(LIBADB_LOCATION)" = "local" ]; then \
	  make -C android-tools lib; \
	  cp $(ADB_OUT_DIR)libadb$(LIB_SUFFIX) addon/data/$(B2G_PLATFORM)/adb; \
	fi;

locales:
	python build/make-locales.py

run:
	cd addon-sdk && . bin/activate && cd ../addon && cfx run --templatedir template/ $(BIN_ARG) $(PROFILE_ARG)

package:
	cd addon-sdk && . bin/activate && cd ../addon && cfx xpi --templatedir template/

test:
	cd addon-sdk && . bin/activate && cd ../addon && cfx test --verbose --templatedir template/ $(BIN_ARG) $(TEST_ARG) $(PROFILE_ARG)

help:
	@echo 'Targets:'
	@echo "  build: [default] build, download, install everything;\n"\
	"         combines the profile, b2g, and adb make targets"
	@echo '  clean: remove files created during the build process'
	@echo '  profile: make the Gaia profile and its prosthesis addon'
	@echo '  b2g: download and install B2G'
	@echo '  adb: download and install ADB libraries'
	@echo '  locales: pull/update l10n repositories for specified locales'
	@echo '  run: start Firefox with the addon installed into a new profile'
	@echo '  package: package the addon into a XPI'
	@echo '  test: run automated tests'
	@echo '  help: show this message'
