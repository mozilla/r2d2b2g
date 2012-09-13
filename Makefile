.PHONY: help build package

build:
	cd gaia && make
	rm -rf gaia/profile/startupCache
	rm -rf addon/data/profile/ && mv gaia/profile addon/data/profile/
	python ./build.py

package:
	cd addon-sdk && source bin/activate && cd ../addon && cfx xpi

help:
	@echo 'Targets:'
	@echo '  build:   build'
