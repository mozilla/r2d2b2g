/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

let Cu = Components.utils;
let Cc = Components.classes;
let Ci = Components.interfaces;

function debug(aMsg) {
/*  Cc["@mozilla.org/consoleservice;1"]
    .getService(Ci.nsIConsoleService)
    .logStringMessage("--*-- ScratchpadActor : " + aMsg);*/
}

Components.utils.import("resource://gre/modules/Services.jsm");

let ScratchpadActor = function ScratchpadActor(aConnection) { debug("init"); }

ScratchpadActor.prototype = {
  actorPrefix: "scratchpad",

  _stringify: function (value) {
    return value ? value.toString() : "";
  },

  // { text, context, uniqueName } = request;
  evalInSandbox: function evalInContentSandbox(request) {
    if (["chrome", "app", "browser-tab"].indexOf(request.context) < 0) {
      return {
        error: "unkownContext"
      };
    }

    let error, result, name, location;

    try {
      let sandbox, app, tab;

      switch (request.context) {
      case "chrome":
        sandbox = this.chromeSandbox;
        name = "Simulator";
        location = this.browserWindow.location.href;
        break;
      case "app":
        sandbox = this.appSandbox;
        app = this.displayedApp;
        name = app ? app.name : "";
        location = this._previousAppLocation;
        break;
      case "browser-tab":
        app = this.displayedApp;
        if (!app || app.origin !== "app://browser.gaiamobile.org") {
          return {
            error: "browserNotDisplayed"
          };
        }
        tab = this.displayedBrowserTab;
        name = tab ? tab.dom.contentWindow.title : "";
        sandbox = this.browserTabSandbox;
        location = this._previousBrowserTabLocation;
        break;
      }

      result = Cu.evalInSandbox(request.text, sandbox, "1.8",
                                request.uniqueName, 1);
    }
    catch (ex) {
      Cu.reportError(ex);
      error = [ex.toString(), ex.fileName, ex.lineNumber].join(" ");
    }

    return {
      scratchpad: {
        name: name,
        location: location,
        error: error,
        result: this._stringify(result)
      }
    };
  },

  get browserWindow() {
    let win = Services.wm.getMostRecentWindow("navigator:browser");
    return win;
  },

  _previousWindow: null,

  get displayedApp() {
    let win = this.browserWindow;
    let home = win.wrappedJSObject.shell.contentBrowser.contentWindow.wrappedJSObject;

    let app = home.WindowManager.getCurrentDisplayedApp();

    return app ? app : null;
  },

  _appSandbox: null,

  get appSandbox() {
    if (!this.displayedApp) {
      Cu.reportError("displayedApp.unavailable");
      return;
    }

    let window = this.displayedApp.iframe.contentWindow;
    let location = window.location.href;

    if (!this._appSandbox ||
        this.browserWindow != this._previousBrowserWindow ||
        this._previousApp != this.displayedApp ||
        this._previousAppLocation != location) {
      this._appSandbox = new Cu.Sandbox(window,
        { sandboxPrototype: window,
          wantXrays: false,
          sandboxName: 'scratchpad-app'
        });

      this._previousApp = this.displayedApp;
      this._previousAppLocation = location;
    }

    return this._appSandbox;
  },

  get displayedBrowserTab() {
    let app = this.displayedApp;

    if (app) {
      return app.iframe.contentWindow.Browser.currentTab;
    }

    return null;
  },

  _browserTabSandbox: null,
  get browserTabSandbox() {
    if (!this.displayedBrowserTab) {
      Cu.reportError("displayedBrowserTab.unavailable");
      return;
    }

    let window = this.displayedBrowserTab.dom.contentWindow;
    let location = window.location.href;

    if (!this._browserTabSandbox ||
        this.browserWindow != this._previousBrowserWindow ||
        this._previousBrowserTab != this.displayedBrowserTab ||
        this._previousBrowserTabLocation != location) {
      this._browserTabSandbox = new Cu.Sandbox(window,
        { sandboxPrototype: window,
          wantXrays: false,
          sandboxName: 'scratchpad-browser-tab'
        });

      this._previousBrowserTab = this.displayedBrowserTab;
      this._previousBrowserTabLocation = location;
    }

    return this._browserTabSandbox;
  },

  _chromeSandbox: null,

  get chromeSandbox()
  {
    if (!this.browserWindow) {
      Cu.reportError("browserWindow.unavailable");
      return;
    }

    if (!this._chromeSandbox ||
        this.browserWindow != this._previousBrowserWindow) {
      this._chromeSandbox = new Cu.Sandbox(this.browserWindow,
        { sandboxPrototype: this.browserWindow, wantXrays: false,
          sandboxName: 'scratchpad-chrome'});

      this._previousBrowserWindow = this.browserWindow;
    }

    return this._chromeSandbox;
  },
}

ScratchpadActor.prototype.requestTypes = {
  "evalInSandbox": ScratchpadActor.prototype.evalInSandbox
};

DebuggerServer.addGlobalActor(ScratchpadActor, "scratchpadActor");
