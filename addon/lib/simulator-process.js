/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. 
 */

'use strict';

const { Cc, Ci, Cu, ChromeWorker } = require("chrome");

Cu.import("resource://gre/modules/Services.jsm");

const { EventTarget } = require("sdk/event/target");
const { emit, off } = require("sdk/event/core");
const { Class } = require("sdk/core/heritage");
const Environment = require("sdk/system/environment").env;
const Runtime = require("runtime");
const Self = require("self");
const URL = require("url");
const Subprocess = require("subprocess");
const Promise = require("sdk/core/promise");

const { rootURI: ROOT_URI } = require('@loader/options');
const PROFILE_URL = ROOT_URI + "profile/";

// Log subprocess error and debug messages to the console.  This logs messages
// for all consumers of the API.  We trim the messages because they sometimes
// have trailing newlines.  And note that registerLogHandler actually registers
// an error handler, despite its name.
Subprocess.registerLogHandler(
  function(s) console.error("subprocess: " + s.trim())
);
Subprocess.registerDebugHandler(
  function(s) console.debug("subprocess: " + s.trim())
);

exports.SimulatorProcess = Class({
  extends: EventTarget,
  initialize: function initialize(options) {
    EventTarget.prototype.initialize.call(this, options);

    this.on("stdout", function onStdout(data) console.log(data.trim()));
    this.on("stderr", function onStderr(data) console.error(data.trim()));
  },

  // check if b2g is running
  get isRunning() !!this.process,

  /**
   * Start the process and connect the debugger client.
   */
  run: function() {
    // resolve b2g binaries path (raise exception if not found)
    let b2gExecutable = this.b2gExecutable;

    // kill before start if already running
    if (this.process != null) {
      this.process.kill();
    }

    this.once("stdout", function () {
      if (Runtime.OS == "Darwin") {
          console.debug("WORKAROUND run osascript to show b2g-desktop window"+
                        " on Runtime.OS=='Darwin'");
        // Escape double quotes and escape characters for use in AppleScript.
        let path = b2gExecutable.path
          .replace(/\\/g, "\\\\").replace(/\"/g, '\\"');

        Subprocess.call({
          command: "/usr/bin/osascript",
          arguments: ["-e", 'tell application "' + path + '" to activate'],
        });
      }
    });  

    let environment;
    if (Runtime.OS == "Linux") {
      environment = ["TMPDIR=" + Services.dirsvc.get("TmpD",Ci.nsIFile).path];
      if ("DISPLAY" in Environment) {
        environment.push("DISPLAY=" + Environment.DISPLAY);
      }
    }

    // spawn a b2g instance
    this.process = Subprocess.call({
      command: b2gExecutable,
      arguments: this.b2gArguments,
      environment: environment,

      // emit stdout event
      stdout: (function(data) {
        emit(this, "stdout", data);
      }).bind(this),

      // emit stderr event
      stderr: (function(data) {
        emit(this, "stderr", data);
      }).bind(this),

      // on b2g instance exit, reset tracked process, remoteDebuggerPort and
      // shuttingDown flag, then finally emit an exit event
      done: (function(result) {
        console.log(this.b2gFilename + " terminated with " + result.exitCode);
        this.process = null;
        emit(this, "exit", result.exitCode);
      }).bind(this)
    });
  },

  // request a b2g instance kill
  kill: function() {
    if (this.process && !this.shuttingDown) {
      let deferred = Promise.defer();
      emit(this, "kill", null);
      this.shuttingDown = true;
      this.once("exit", (exitCode) => {
        this.shuttingDown = true;
        deferred.resolve(exitCode);
      });
      this.process.kill();
      return deferred.promise;
    } else {
      return Promise.resolve(-1);
    }
  },  

  // compute current b2g filename
  get b2gFilename() {
    return this._executable ? this._executableFilename : "B2G";
  },

  // compute current b2g file handle
  get b2gExecutable() {
    if (this._executable) return this._executable;

    let executables = {
      WINNT: "win32/b2g/b2g-bin.exe",
      Darwin: "mac64/B2G.app/Contents/MacOS/b2g-bin",
      Linux: (Runtime.XPCOMABI.indexOf("x86_64") == 0 ? "linux64" : "linux") +
        "/b2g/b2g-bin",
    };

    let url = Self.data.url(executables[Runtime.OS]);
    let path = URL.toFilename(url);

    let executable = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);    
    executable.initWithPath(path);
    let executableFilename = executables[Runtime.OS];

    // Support B2G binaries built without GAIADIR.
    if (!executable.exists()) {
      let executables = {
        WINNT: "win32/b2g/b2g.exe",
        Darwin: "mac64/B2G.app/Contents/MacOS/b2g",
        Linux: (Runtime.XPCOMABI.indexOf("x86_64") == 0 ? "linux64" : "linux") +
          "/b2g/b2g",
      };
      let url = Self.data.url(executables[Runtime.OS]);
      let path = URL.toFilename(url);
      executable.initWithPath(path);
      executableFilename = executables[Runtime.OS];
    }

    if (!executable.exists()) {
      // B2G binaries not found
      throw Error("b2g-desktop Executable not found.");
    }

    this._executable = executable;
    this._executableFilename = executableFilename;

    return executable;
  },

  // compute b2g CLI arguments
  get b2gArguments() {
    let args = [];

    let profile = URL.toFilename(PROFILE_URL);
    args.push("-profile", profile);

    // NOTE: push dbgport option on the b2g-desktop commandline
    args.push("-dbgport", "" + this.remoteDebuggerPort);
    
    // Ignore eventual zombie instances of b2g that are left over
    args.push("-no-remote");

    return args;
  },
});

