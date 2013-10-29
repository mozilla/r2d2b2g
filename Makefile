.PHONY: build clean profile prosthesis b2g appinfo locales run package test help

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

B2G_VERSION=1.2
ADDON_NAME=fxos_1_2_simulator
# compute addon version out of package.json
# matches xx.yy[pre,a,b]zz version patterns
ADDON_VERSION=$(shell grep version addon/package.json | perl -p -e 's/.*([0-9]+\.[0-9]+(pre|a|b)?[0-9]*(dev)?(\.[0-9]{8})).*/\1/')

XPI_NAME=$(ADDON_NAME)-$(ADDON_VERSION)-$(B2G_PLATFORM).xpi

FTP_ROOT_PATH=/pub/mozilla.org/labs/fxos-simulator
UPDATE_PATH=$(B2G_VERSION)/$(B2G_PLATFORM)
UPDATE_LINK=https://ftp.mozilla.org$(FTP_ROOT_PATH)/$(UPDATE_PATH)/$(XPI_NAME)
UPDATE_URL=https://ftp.mozilla.org$(FTP_ROOT_PATH)/$(UPDATE_PATH)/update.rdf

# The type of the B2G build.  It can be "nightly", in which case you may set
# B2G_ID to the ID of the build (default: the most recent nightly build);
# or "specific", in which case you must set B2G_URL to the URL of the build.
B2G_TYPE ?= specific

# The ID of the nightly B2G build.
# Sometimes this is based on the latest stable nightly for Unagi according to
# https://releases.mozilla.com/b2g/promoted_to_stable/ (private URL).
# B2G_ID

# Use the current last known revision that sucessfully builds on Windows.
B2G_URL_BASE = https://ftp.mozilla.org/pub/mozilla.org/b2g/nightly/2013-10-28-00-40-02-mozilla-aurora/

# Currently, all B2G builds are custom so we can optimize for code size and fix
# bugs in B2G or its nightly build environments (like 844047 and 815805).

# Platform-specific Defines
ifeq (win32, $(B2G_PLATFORM))
  # The URL of the specific B2G build.
  B2G_URL ?= $(B2G_URL_BASE)b2g-26.0a2.multi.win32.zip
  B2G_BIN_DIR = b2g
else
ifeq (mac64, $(B2G_PLATFORM))
  B2G_URL ?= $(B2G_URL_BASE)b2g-26.0a2.multi.mac64.dmg
  DOWNLOAD_CMD = /usr/bin/curl -O
  B2G_BIN_DIR = B2G.app/Contents/MacOS
else
ifeq (linux64, $(B2G_PLATFORM))
  B2G_URL ?= $(B2G_URL_BASE)b2g-26.0a2.multi.linux-x86_64.tar.bz2
  B2G_BIN_DIR = b2g
else
ifeq (linux, $(B2G_PLATFORM))
  B2G_URL ?= $(B2G_URL_BASE)b2g-26.0a2.multi.linux-i686.tar.bz2
  B2G_BIN_DIR = b2g
endif
endif
endif
endif

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

export LOCALES_FILE=${PWD}/build/languages.json
export LOCALE_BASEDIR ?= $(PWD)/gaia-l10n

# Gaia expects these to be Windows-style paths on Windows.
ifeq (win32, $(B2G_PLATFORM))
  LOCALES_FILE := $(call unix_to_windows_path,$(LOCALES_FILE))
  LOCALE_BASEDIR := $(call unix_to_windows_path,$(LOCALE_BASEDIR))
endif

build: profile b2g appinfo

clean:
	rm -rf addon/data/$(B2G_PLATFORM)
	rm -rf addon/template
	rm -f gaia/build/custom-prefs.js
	rm -f gaia/build/custom-settings.json
	$(MAKE) -C gaia clean
	python build/make-b2g.py $(B2G_TYPE_ARG) $(B2G_PLATFORM_ARG) $(B2G_ID_ARG) $(B2G_URL_ARG) --clean

profile:
	cp build/override-prefs.js gaia/build/custom-prefs.js
	cp build/override-settings.json gaia/build/custom-settings.json
	NOFTU=1 GAIA_APP_TARGET=production $(MAKE) -C gaia
	DESKTOP=1 NOFTU=1 GAIA_APP_TARGET=production $(MAKE) -C gaia preferences
	python build/override-webapps.py
	cd gaia/tools/extensions/desktop-helper/ && zip -r ../../../profile/extensions/desktop-helper\@gaiamobile.org.xpi *
	cd gaia/tools/extensions/activities/ && zip -r ../../../profile/extensions/activities\@gaiamobile.org.xpi *
	rm -rf gaia/profile/startupCache gaia/profile/places.* gaia/profile/permissions.sqlite gaia/profile/defaults
	zip -d gaia/profile/webapps/keyboard.gaiamobile.org/application.zip js/imes/latin/dictionaries/*
	rm -rf addon/template
	mkdir -p addon/template
	mv gaia/profile addon/template/
	cp gaia/profile-debug/user.js addon/template/profile/
	cp addon-sdk/app-extension/bootstrap.js addon/template/
	cp addon-sdk/app-extension/install.rdf addon/template/
	mkdir -p addon/template/profile/extensions
	cd prosthesis && zip -r b2g-prosthesis\@mozilla.org.xpi content components defaults locale modules chrome.manifest install.rdf
	mv prosthesis/b2g-prosthesis@mozilla.org.xpi addon/template/profile/extensions

# The 'prosthesis' target was folded into the 'profile' target, so it is just
# an alias to that target now.
prosthesis: profile

appinfo: profile b2g
	python build/make-appinfo.py --gecko addon/data/$(B2G_PLATFORM)/$(B2G_BIN_DIR)/ --gaia gaia/ --data addon/data/ --package addon/package.json

b2g:
	python build/make-b2g.py $(B2G_TYPE_ARG) $(B2G_PLATFORM_ARG) $(B2G_ID_ARG) $(B2G_URL_ARG)
	rm -rf addon/data/$(B2G_PLATFORM)/$(B2G_BIN_DIR)/gaia

locales:
	python build/make-locales.py

run:
	cd addon-sdk && . bin/activate && cd ../addon && cfx run --templatedir template/ $(BIN_ARG) $(PROFILE_ARG)

package:
	cd addon-sdk && . bin/activate && cd ../addon && cfx xpi --templatedir template/ --strip-sdk $(PRODUCTION_ARG)

production: PRODUCTION_ARG=--update-link $(UPDATE_LINK) --update-url $(UPDATE_URL)
production: locales build package

release: addon/$(ADDON_NAME).xpi addon/$(ADDON_NAME).update.rdf
	@if [ -z $(SSH_USER) ]; then \
	  echo "release target requires SSH_USER env variable to be defined."; \
	  exit 1; \
	fi
	ssh $(SSH_USER)@stage.mozilla.org 'mkdir -m 775 -p $(FTP_ROOT_PATH)/$(UPDATE_PATH)'
	chmod 664 addon/$(ADDON_NAME).xpi addon/$(ADDON_NAME).update.rdf
	scp -p addon/$(ADDON_NAME).xpi $(SSH_USER)@stage.mozilla.org:$(FTP_ROOT_PATH)/$(UPDATE_PATH)/$(XPI_NAME)
	ssh $(SSH_USER)@stage.mozilla.org 'cd $(FTP_ROOT_PATH)/$(UPDATE_PATH)/ && ln -fs $(XPI_NAME) $(ADDON_NAME)-$(B2G_PLATFORM)-latest.xpi'
	scp -p addon/$(ADDON_NAME).update.rdf $(SSH_USER)@stage.mozilla.org:$(FTP_ROOT_PATH)/$(UPDATE_PATH)/update.rdf

test:
	cd addon-sdk && . bin/activate && cd ../addon && cfx test --verbose --templatedir template/ $(BIN_ARG) $(TEST_ARG) $(PROFILE_ARG)

help:
	@echo 'Targets:'
	@echo "  build: [default] build, download, install everything;\n"\
	"         combines the profile, appinfo and b2g make targets"
	@echo '  clean: remove files created during the build process'
	@echo '  profile: make the Gaia profile and its prosthesis addon'
	@echo '  appinfo: create a static json file describing the gecko and gaia version we are shipping in the addon'
	@echo '  b2g: download and install B2G'
	@echo '  locales: pull/update l10n repositories for specified locales'
	@echo '  run: start Firefox with the addon installed into a new profile'
	@echo '  package: package the addon into a XPI'
	@echo '  test: run automated tests'
	@echo '  help: show this message'
