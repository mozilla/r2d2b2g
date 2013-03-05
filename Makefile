.PHONY: build profile prosthesis b2g adb run package help

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

# Currently, all B2G builds are custom so we can optimize for code size and fix
# bugs in B2G or its nightly build environments (like 844047 and 815805).

# Platform-specific Defines
ifeq (win32, $(B2G_PLATFORM))
  # The URL of the specific B2G build.
  B2G_URL ?= $(B2G_URL_BASE)b2g-18.0.2013-03-04.en-US.win32.zip

  ADB_PACKAGE = adb-1.0.31-windows.zip
  ADB_BINARIES = adb.exe AdbWinApi.dll AdbWinUsbApi.dll
  BIN_SUFFIX = .exe
else
ifeq (mac64, $(B2G_PLATFORM))
  B2G_URL ?= $(B2G_URL_BASE)b2g-18.0.2013-03-04.en-US.mac64.dmg

  ADB_PACKAGE = adb-1.0.31-mac.zip
  ADB_BINARIES = adb

  DOWNLOAD_CMD = /usr/bin/curl -O
else
ifeq (linux64, $(B2G_PLATFORM))
  B2G_URL ?= $(B2G_URL_BASE)b2g-18.0.2013-03-04.en-US.linux-x86_64.tar.bz2
else
ifeq (linux, $(B2G_PLATFORM))
  B2G_URL ?= $(B2G_URL_BASE)b2g-18.0.2013-03-04.en-US.linux-i686.tar.bz2
endif
endif

  ADB_PACKAGE = adb-1.0.31-linux.zip
  ADB_BINARIES = adb
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

build: profile prosthesis b2g adb

profile:
	make -C gaia
	python build/override-settings.py
	python build/override-webapps.py
	rm -rf gaia/profile/startupCache
	rm -rf addon/template
	mkdir -p addon/template
	mv gaia/profile addon/template/
	cp addon-sdk/app-extension/bootstrap.js addon/template/
	cp addon-sdk/app-extension/install.rdf addon/template/

prosthesis: profile
	mkdir -p addon/template/profile/extensions
	cd prosthesis && zip -r b2g-prosthesis\@mozilla.org.xpi content components defaults locale modules skin chrome.manifest install.rdf
	mv prosthesis/b2g-prosthesis@mozilla.org.xpi addon/template/profile/extensions

b2g:
	python build/make-b2g.py $(B2G_TYPE_ARG) $(B2G_PLATFORM_ARG) $(B2G_ID_ARG) $(B2G_URL_ARG)

adb:
	mkdir -p addon/data/$(B2G_PLATFORM)
	cd addon/data/$(B2G_PLATFORM)
	rm -f $(ADB_BINARIES)
	cd ../../..
	$(DOWNLOAD_CMD) $(ADB_URL)
	unzip $(ADB_PACKAGE) -d addon/data/$(B2G_PLATFORM)

run:
	cd addon-sdk && . bin/activate && cd ../addon && cfx run --templatedir template/ $(BIN_ARG) $(PROFILE_ARG)

package:
	cd addon-sdk && . bin/activate && cd ../addon && cfx xpi --templatedir template/

test:
	cd addon-sdk && . bin/activate && cd ../addon && cfx test --verbose --templatedir template/ $(BIN_ARG) $(TEST_ARG) $(PROFILE_ARG)

help:
	@echo 'Targets:'
	@echo "  build: [default] build, download, install everything;\n"\
	"         combines the profile, prosthesis, and b2g make targets"
	@echo '  profile: make the Gaia profile'
	@echo '  prosthesis: make the prosthesis addon that enhances B2G'
	@echo '  b2g: download and install B2G'
	@echo '  run: start Firefox with the addon installed into a new profile'
	@echo '  package: package the addon into a XPI'
	@echo '  help: show this message'
