**Note: This project is no longer maintained in this repo.  It has been merged into the main Gecko (Firefox) [repo][1].**

r2d2b2g is an experimental prototype test environment for Firefox OS
in the form of a [Firefox Desktop addon](https://ftp.mozilla.org/pub/mozilla.org/labs/fxos-simulator/).

To hack on it, clone this repository, then:

    git submodule init
    git submodule update
    make build
    make run

Caution! You need plentiful disk and patience, as the submodules and build process require copious space and time.

[1]: https://github.com/mozilla/gecko-dev/tree/master/b2g/simulator
