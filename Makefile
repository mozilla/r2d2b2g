.PHONY: build profile prosthesis b2g run package help

SYS=$(shell uname -s)
ifneq (,$(findstring MINGW32_,$(SYS)))
SYS=WINNT
endif

include default.mk
-include local.mk

# Disable OOP on Windows and Linux to work around repaint problems (bug 799768).
# On Windows, disabling OOP also worked around a B2G startup crash (bug 795484),
# although it doesn't appear to be necessary anymore.
DISABLE_OOP =
ifneq (,$(filter WINNT Linux,$(SYS)))
DISABLE_OOP = perl -p -i.bak -e 's|"debug\.oop\.disabled": false|"debug.oop.disabled": true|' gaia/profile/settings.json && rm gaia/profile/settings.json.bak
endif

build: profile prosthesis b2g

profile:
	make -C gaia
	$(DISABLE_OOP)
	rm -rf gaia/profile/startupCache
	rm -rf addon/template
	mkdir -p addon/template
	mv gaia/profile addon/template/
	cp addon-sdk/python-lib/cuddlefish/app-extension/bootstrap.js addon/template/
	cp addon-sdk/python-lib/cuddlefish/app-extension/install.rdf addon/template/

prosthesis: profile
	mkdir -p addon/template/profile/extensions
	cd prosthesis && zip -r b2g-prosthesis\@mozilla.org.xpi content defaults locale skin chrome.manifest install.rdf
	mv prosthesis/b2g-prosthesis@mozilla.org.xpi addon/template/profile/extensions

DATE_ARG = --date $(DATE)

ifdef PLATFORM
  PLATFORM_ARG = --platform $(PLATFORM)
endif

b2g:
	python ./make-b2g.py $(DATE_ARG) $(PLATFORM_ARG)

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
