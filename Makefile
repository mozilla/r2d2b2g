.PHONY: build profile prosthesis b2g run package help

SYS=$(shell uname -s)
ifneq (,$(findstring MINGW32_,$(SYS)))
SYS=WINNT
endif

include build/default.mk
-include local.mk

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

DATE_ARG = --date $(DATE)

ifdef PLATFORM
  PLATFORM_ARG = --platform $(PLATFORM)
endif

b2g:
	python build/make-b2g.py $(DATE_ARG) $(PLATFORM_ARG)

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
