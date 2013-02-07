#! /usr/bin/env python
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import sys
import tempfile
import shutil
from optparse import OptionParser, OptionGroup
from platform import architecture

sys.path.insert(0, os.path.join(os.getcwd(), "mozdownload"))
sys.path.insert(0, os.path.join(os.getcwd(), "mozbase", "mozinstall"))
sys.path.insert(0, os.path.join(os.getcwd(), "mozbase", "mozinfo"))

from mozdownload.scraper import DailyScraper, DirectScraper
import mozinstall

usage = 'usage: %prog [options]'
parser = OptionParser(usage=usage, description=__doc__)
parser.add_option('--type', '-t',
                  dest='type',
                  choices=['nightly', 'specific'],
                  metavar='TYPE',
                  default='nightly',
                  help='type of build to use; '
                       'default: a nightly build')
parser.add_option('--platform', '-p',
                  dest='platform',
                  choices=['win32', 'mac64', 'linux', 'linux64'],
                  metavar='PLATFORM',
                  help='the platform of the build; '
                       'default: the current platform')

# Option group for nightly builds.
group = OptionGroup(parser, "nightly builds",
                    "extra options for nightly builds")
group.add_option('--id', None,
                 dest='id',
                 metavar='YYYYMMDDHHMMSS',
                 help='the ID of the nightly build; '
                      'default: the most recent nightly build')
parser.add_option_group(group)

# Option group for specific builds.
group = OptionGroup(parser, "specific builds",
                    "extra options for specific builds")
group.add_option('--url', '-u',
                 dest='url',
                 metavar='URL',
                 help='the URL of the specific build')
parser.add_option_group(group)

(options, args) = parser.parse_args()

#tmpdir = tempfile.mkdtemp()
#print "temp dir: %S", tmpdir
#downloaddir = tmpdir
downloaddir = os.getcwd()

datadir = os.path.join(os.getcwd(), "addon", "data")

(bits, linkage) = architecture()

if options.platform:
  platform = options.platform
else:
  if sys.platform == 'win32':
    platform = 'win32'
  elif sys.platform == 'darwin':
    platform = 'mac64'
  elif sys.platform.startswith('linux'):
    if bits == '64bit':
      platform = 'linux64'
    else:
      platform = 'linux'
  else:
    platform = sys.platform

if   platform == 'win32':
  installdirname = 'b2g'
elif platform == 'mac64':
  installdirname = 'B2G.app'
elif platform == 'linux' or platform == 'linux64':
  installdirname = 'b2g'
else:
  raise NotImplementedError('platform %s not supported' % platform)

# Download latest build of B2G Desktop.

scraper_keywords = {
  'application': 'b2g',
  'platform': platform,
  'locale': 'multi',
  'version': None,
  'directory': downloaddir
}

scraper_options = {
  'nightly': {
    'branch': 'mozilla-b2g18_v1_0_0',
    'build_id': options.id
  },
  'specific': {}
}

kwargs = scraper_keywords.copy()
kwargs.update(scraper_options.get(options.type, {}))

if options.type == 'nightly':
  # DailyScraper generally chooses the right extension based on the platform,
  # but it looks for a .exe installer on Windows by default, and B2G nightlies
  # for Windows come only in the .zip variant, so specify that extension.
  if platform == "win32":
    kwargs.update({ 'extension': 'zip' })
  build = DailyScraper(**kwargs)
elif options.type == 'specific':
  build = DirectScraper(options.url, **kwargs)
else:
  raise NotImplementedError('type %s not supported' % options.type)

print "Initiating B2G download."
build.download()


# Install B2G Desktop to addon's data directory.
installer = os.path.abspath(build.target)

# Remove the existing installation, then install.
platformdir = os.path.join(datadir, platform)
shutil.rmtree(os.path.join(platformdir, installdirname), True)
mozinstall.install(installer, platformdir)


# Clean up.

#shutil.rmtree(tmpdir)
