.PHONY: help build

build:
	cd gaia && make
	rm -rf gaia/profile/startupCache
	rm -rf addon/data/profile/ && mv gaia/profile addon/data/profile/
	python ./build.py

help:
	@echo 'Targets:'
	@echo '  build:   build'
