.PHONY: help build run package

build:
	cd gaia && make
	rm -rf gaia/profile/startupCache
	rm -rf addon/data/profile && mv gaia/profile addon/data/profile
	python ./build.py

run:
	cd addon-sdk && source bin/activate && cd ../addon && cfx run

package:
	cd addon-sdk && source bin/activate && cd ../addon && cfx xpi

help:
	@echo 'Targets:'
	@echo '  build: make Gaia profile, download B2G'
	@echo '  package: package the addon into a XPI'
