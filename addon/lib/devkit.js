/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

'use strict';

const { Cc, Ci, Cr, Cu } = require("chrome");

const Self = require("self");
const File = require("file");

Cu.import("resource://gre/modules/Services.jsm");

const templatePath = Self.data.url("resources");

let devkit = module.exports = {

    createNewApp: function(manifestData) {
        console.log("DevKit.createNewApp");

        let win = Services.wm.getMostRecentWindow("navigator:browser");

        let fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
        fp.init(win, "Select a Location for your project", Ci.nsIFilePicker.modeGetFolder);

        let ret = fp.show();
        if (ret == Ci.nsIFilePicker.returnOK || ret == Ci.nsIFilePicker.returnReplace) {
          let projectPath = fp.file.path;
          console.log("DevKit: Selected " + projectPath);

          let sanitizedName = this.sanitizeStringForFilename(manifestData.name);
          projectPath = File.join(projectPath, sanitizedName);
          File.mkpath(projectPath);

          let manifestPath = File.join(projectPath, 'manifest.webapp');
          let manifest = File.open(manifestPath, 'w');
          manifest.write(JSON.stringify(manifestData, null, 2));
          manifest.close();

          // populate the new project from a template.
          let templateName = 'empty-project';
          console.log('DevKit: cloning from ' + templateName);
          this.cloneDir('empty-project', projectPath);

          // tell the caller where we placed the new manifest.
          return manifestPath;
        }
        return false;
    },

    cloneDir: function (template, destPath) {
        let templatePath = 'resources/' + template + '/';
        let templateFileList = Self.data.load(templatePath + 'filelist.json');
        let files = JSON.parse(templateFileList);
        for (let name of files) {
            let outPath = File.join(destPath, name);
            console.log('DevKit: writing ' + outPath);
            let file = File.open(outPath, 'w');
            file.write(Self.data.load(templatePath + name));
            file.close();
        }
    },

    // borrowed from http://dxr.mozilla.org/mozilla-central/source/toolkit/webapps/WebappOSUtils.jsm
    sanitizeStringForFilename: function(aPossiblyBadFilenameString) {
      return aPossiblyBadFilenameString.replace(/[^a-z0-9_\-]/gi, "");
    }
};