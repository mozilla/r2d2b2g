.PHONY: build profile prosthesis b2g run package help

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

build: profile prosthesis b2g

profile:
	make -C gaia
	$(DISABLE_OOP)
	rm -rf gaia/profile/startupCache
	rm -rf addon/data/profile && mv gaia/profile addon/data/profile

prosthesis: profile
	mkdir -p addon/data/profile/extensions
	cd prosthesis && zip -r b2g-prosthesis\@mozilla.org.xpi content defaults locale skin chrome.manifest install.rdf
	mv prosthesis/b2g-prosthesis@mozilla.org.xpi addon/data/profile/extensions

b2g:
	python ./build.py $(PLATFORM_ARG)

run:
	cd addon-sdk && . bin/activate && cd ../addon && cfx run

package:
	cd addon-sdk && . bin/activate && cd ../addon && cfx xpi

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
