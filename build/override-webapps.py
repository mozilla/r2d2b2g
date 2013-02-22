#!/usr/bin/python

# Filter default apps, removing the ones that distract from testing apps.

import json
import os
import shutil
import zipfile
import subprocess

apps_file = 'gaia/profile/webapps/webapps.json'
overrides_file = 'build/override-webapps.json'
homescreen_dir = 'gaia/profile/webapps/homescreen.gaiamobile.org'
grid_file = 'js/init.json'

with open(apps_file, 'r') as f:
  apps = json.load(f)

with open(overrides_file, 'r') as f:
  overrides = json.load(f)

manifestURLs = []

for key in overrides['remove']:
  # Remove app from webapps.json.
  if key in apps:
    manifestURLs.append(apps[key]['manifestURL'])
    del apps[key]

  # Remove app directory.
  dir = 'gaia/profile/webapps/' + key
  if os.path.exists(dir):
    shutil.rmtree(dir)

with open(apps_file, 'wb') as f:
  json.dump(apps, f, indent=2)

# Remove apps from initial grid.
manifestURLs = set(manifestURLs)
old_cwd = os.getcwd()
os.chdir(homescreen_dir)
archive = zipfile.ZipFile('application.zip', mode='r')
archive.extract(grid_file)
archive.close()
with open(grid_file, 'r') as f:
  grid_json = json.load(f)
old_grid = grid_json["grid"]
new_grid = []
def f(x): return not (x['manifestURL'] in manifestURLs)
for page in old_grid:
  new_grid.append(filter(f, page))
grid_json["grid"] = new_grid
with open(grid_file, 'wb') as f:
  json.dump(grid_json, f, indent=2)
subprocess.call(['zip', '-f', 'application.zip', grid_file])
os.remove(grid_file)
try:
  os.rmdir('js')
except Exception:
  pass
os.chdir(old_cwd)
