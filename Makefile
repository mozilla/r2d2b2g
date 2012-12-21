.PHONY: build profile prosthesis b2g run package help

-include local.mk

SYS = $(shell uname -s)
ARCH = $(shell uname -m)
ifneq (,$(findstring MINGW32_,$(SYS)))
SYS = WINNT
endif

# The type of B2G build to use.  It can be "specific", in which case you must
# set B2G_URL to the URL of the build; or "nightly", in which case you may set
# B2G_DATE to the date of the build (default: the most recent nightly build).
B2G_TYPE ?= specific

# The URL of the specific B2G build.
B2G_URL_BASE ?= https://ftp.mozilla.org/pub/mozilla.org/labs/r2d2b2g/
ifeq (WINNT, $(SYS))
  B2G_URL ?= $(B2G_URL_BASE)b2g-18.0.2012-12-17.en-US.win32.zip
else
ifeq (Darwin, $(SYS))
  B2G_URL ?= $(B2G_URL_BASE)b2g-18.0.2012-12-17.en-US.mac64.dmg
else
ifeq (Linux, $(SYS))
  ifeq (x86_64, $(ARCH))
    B2G_URL ?= $(B2G_URL_BASE)b2g-18.0.2012-12-17.en-US.linux-x86_64.tar.bz2
  else
    B2G_URL ?= $(B2G_URL_BASE)b2g-18.0.2012-12-17.en-US.linux-i686.tar.bz2
  endif
endif
endif
endif

# The date of the nightly build.
# Sometimes this is based on the latest stable nightly for Unagi according to
# https://releases.mozilla.com/b2g/promoted_to_stable/ (private URL).
#
# Currently, we use custom builds via B2G_TYPE=specific and B2G_URL because
# nightly builds have multiple debilitating bugs, like 815805 (Linux) and 816957
# (all platforms).  Once those are fixed, we could switch back to nightlies.
#
#B2G_DATE ?= 2012-12-13

ifdef PLATFORM
  PLATFORM_ARG = --platform $(PLATFORM)
endif

ifdef B2G_TYPE
  B2G_TYPE_ARG = --type $(B2G_TYPE)
endif

ifdef B2G_DATE
  B2G_DATE_ARG = --date $(B2G_DATE)
endif

ifdef B2G_URL
  B2G_URL_ARG = --url $(B2G_URL)
endif

build: profile prosthesis b2g

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
	cd prosthesis && zip -r b2g-prosthesis\@mozilla.org.xpi content defaults locale skin chrome.manifest install.rdf
	mv prosthesis/b2g-prosthesis@mozilla.org.xpi addon/template/profile/extensions

b2g:
	python build/make-b2g.py $(B2G_TYPE_ARG) $(B2G_DATE_ARG) $(B2G_URL_ARG) $(PLATFORM_ARG)

run:
	cd addon-sdk && . bin/activate && cd ../addon && cfx run --templatedir template/

package:
	cd addon-sdk && . bin/activate && cd ../addon && cfx xpi --templatedir template/

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
