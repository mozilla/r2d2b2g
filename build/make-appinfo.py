from optparse import OptionParser, OptionGroup
import ConfigParser
import json
import os
import zipfile

usage = 'usage: %prog [options]'
parser = OptionParser(usage=usage, description=__doc__)
parser.add_option('--gecko',
                  dest='gecko_path',
                  help='path to gecko folder')
parser.add_option('--data',
                  dest='data_path',
                  help='path to data folder')
parser.add_option('--gaia',
                  dest='gaia_path',
                  help='path to gaia folder')
(options, args) = parser.parse_args()


# Read gecko's application.ini to fetch version information
# and write these info as gecko-info.json file in data folder
config = ConfigParser.RawConfigParser()
application_ini = os.path.join(options.gecko_path, "application.ini")
config.read(application_ini)
appinfo = {
  "vendor": config.get("App", "Vendor"),
  "version": config.get("App", "Version"),
  "buildid": config.get("App", "BuildID"),
  "id": config.get("App", "ID"),
  "b2g_version": None
}
prefs_file = os.path.join(options.gecko_path,
                          "defaults", "pref", "b2g.js")
prefs = open(prefs_file, "r")
for line in prefs:
  if "b2g.version" in line:
    appinfo["b2g_version"] = line.split('"')[3]


# Then fetch some usefull data from gaia folder
gaia_revision_file = os.path.join(options.gaia_path, "apps", "settings", "resources", "gaia_commit.txt")
lines = open(gaia_revision_file).readlines()
appinfo["gaia"] = {
  "revision": lines[0].strip(),
  "revision_date": lines[1].strip()
}

appinfo_file = os.path.join(options.data_path, "appinfo.json")
with open(appinfo_file, 'wb') as f:
  json.dump(appinfo, f, indent=2)

