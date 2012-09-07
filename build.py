#! /usr/bin/env python
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import tempfile
import shutil
from mozdownload import DailyScraper
import mozinstall

tmpdir = tempfile.mkdtemp()
print "temp dir: %S", tmpdir

datadir = os.path.join(os.getcwd(), "addon", "data")


# Download latest build of B2G Desktop.

scraper_keywords = { 'application': 'b2g',
                     'platform': 'mac64',
                     'locale': 'en-US',
                     'version': None,
                     'directory': tmpdir }
kwargs = scraper_keywords.copy()

build = DailyScraper(**kwargs)
build.download()


# Install B2G Desktop to addon's data directory.

for file in os.listdir(tmpdir):
  if file.endswith('.dmg'):
    installer = file
    break

mozinstall.install(os.path.join(tmpdir, installer),
                   os.path.join(datadir, "mac64"))


# Clean up.

shutil.rmtree(tmpdir)
