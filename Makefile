.PHONY: help build run package

ifdef PLATFORM
PLATFORM_ARG = --platform $(PLATFORM)
endif

SYS=$(shell uname -s)

# On Windows, out-of-process causes B2G to crash on startup (bug 795484),
# so disable it.
DISABLE_OOP = 
ifneq (,$(findstring MINGW32_,$(SYS)))
DISABLE_OOP = perl -p -i.bak -e 's|"debug\.oop\.disabled": false|"debug.oop.disabled": true|' gaia/profile/settings.json && rm gaia/profile/settings.json.bak
endif

build:
	cd gaia && make
	$(DISABLE_OOP)
	rm -rf gaia/profile/startupCache
	rm -rf addon/data/profile && mv gaia/profile addon/data/profile
	mkdir -p addon/data/profile/extensions && cd prosthesis/ && zip -r b2g-prosthesis\@mozilla.org.xpi content locale skin chrome.manifest install.rdf && mv b2g-prosthesis@mozilla.org.xpi ../addon/data/profile/extensions/ && cd ..
	python ./build.py $(PLATFORM_ARG)

run:
	cd addon-sdk && . bin/activate && cd ../addon && cfx run

package:
	cd addon-sdk && . bin/activate && cd ../addon && cfx xpi

help:
	@echo 'Targets:'
	@echo '  build: make Gaia profile, download B2G'
	@echo '  package: package the addon into a XPI'
