#! /usr/bin/env python
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import sys
import tempfile
import shutil

sys.path.insert(0, os.path.join(os.getcwd(), "mozdownload"))
sys.path.insert(0, os.path.join(os.getcwd(), "mozbase", "mozinstall"))
sys.path.insert(0, os.path.join(os.getcwd(), "mozbase", "mozinfo"))

from mozdownload.scraper import DailyScraper
import mozinstall

#tmpdir = tempfile.mkdtemp()
#print "temp dir: %S", tmpdir
#downloaddir = tmpdir
downloaddir = os.getcwd()

datadir = os.path.join(os.getcwd(), "addon", "data")

if sys.platform == 'win32':
  platform = 'win32'
  file_extension = '.zip'
  installdirname = 'b2g'
elif sys.platform == 'darwin':
  platform = 'mac64'
  file_extension = '.dmg'
  installdirname = 'B2G.app'
elif sys.platform.startswith('linux'):
  platform = 'linux'
  file_extension = '.tar.bz2'
  installdirname = 'b2g'
else:
  raise NotImplementedError('platform %s not supported' % sys.platform)

# Download latest build of B2G Desktop.

scraper_keywords = { 'application': 'b2g',
                     'platform': platform,
                     'locale': 'en-US',
                     'version': None,
                     'directory': downloaddir }
kwargs = scraper_keywords.copy()
if platform == "win32":
  kwargs.update({ 'file_ext': '.zip' })

build = DailyScraper(**kwargs)
print "Initiating download B2G Desktop latest build..."
build.download()


# Install B2G Desktop to addon's data directory.

for file in os.listdir(downloaddir):
  if file.endswith(file_extension):
    installer = os.path.join(downloaddir, file)
    break

# Remove the existing installation, then install.
platformdir = os.path.join(datadir, platform)
shutil.rmtree(os.path.join(platformdir, installdirname), True)
mozinstall.install(installer, platformdir)


# Clean up.

#shutil.rmtree(tmpdir)
