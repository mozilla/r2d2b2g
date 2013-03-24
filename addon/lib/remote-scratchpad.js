/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

'use strict';

const { Cc, Ci, Cu, ChromeWorker } = require("chrome");

let SCRATCHKIT_URI = 'resource:///modules/devtools/scratchpad-manager.jsm'
let { ScratchpadManager } = Cu.import(SCRATCHKIT_URI)

const APP_CONTEXT = 1;
const CHROME_CONTEXT = 2;
const BROWSER_TAB_CONTEXT = 3;

function Scratchpad(options) {
  let { sandbox, text, filename, unload, open, client } = options;

  let statusText = client.isConnected ? "CONNECTED" : "NOT CONNECTED";

  let window = ScratchpadManager.openScratchpad({
    text: text || '// FirefoxOS Simulator Scratchpad\n// '+statusText+'\n'
  })

  window.addEventListener('DOMContentLoaded', function onready() {
    window.addEventListener('unload', function onunload() {
      window.removeEventListener('unload', onunload)
      unload && unload()
    })

    window.removeEventListener('DOMContentLoaded', onready)

    let scratchpad = window.Scratchpad

    let parent = window.document.querySelector("#sp-menu-environment");
    parent.querySelector("#sp-menu-content").
           setAttribute("label", "FirefoxOS App");
    parent.querySelector("#sp-menu-browser").
           setAttribute("label", "FirefoxOS Shell")
    let menuitem = window.document.createElement("menuitem");
    menuitem.id = "sp-menu-browser-tab"
    menuitem.setAttribute("type", "radio");
    menuitem.setAttribute("label", "FirefoxOS Browser Tab");
    menuitem.addEventListener("click", (function () {
      this.executionContext = BROWSER_TAB_CONTEXT;
      return true;
    }).bind(scratchpad));

    parent.appendChild(menuitem);

    let { writeAsComment, openScratchpad } = scratchpad
    open = open || openScratchpad

    Object.defineProperties(scratchpad, {
      _evalInSandbox: {
        configurable: true,
        value: function(cb) {
          let selection = this.selectedText || this.getText();
          let context;

          switch (this.executionContext) {
          case BROWSER_TAB_CONTEXT:
            context = "browser-tab";
            break;
          case CHROME_CONTEXT:
            context = "chrome";
            break;
          case APP_CONTEXT:
            context = "app";
            break;
          }

          if (client.isConnected) {
            client.evalInSandbox(selection, context, this.uniqueName, cb);
          } else {
            this.writeAsErrorComment("ERROR: client not connected");
          }
        }
      },
      _setTitle: {
        configurable: true,
        value: function (name, location) {
          let title = "Scratchpad - " + name + " - " + location;
          window.document.documentElement.setAttribute("title", title);
        }
      },
      run: {
        configurable: true,
        value: function() {
          this._evalInSandbox((function onResponse(pkt) {
            if (pkt.error) {
              this.writeAsErrorComment(pkt.error);
              return;
            }

            let data = pkt.scratchpad;
            this._setTitle(data.name, data.location);

            if (!data.error) {
              this.deselect();
            } else {
                this.writeAsErrorComment(data.error);
            }
          }).bind(this));
        }
      },
      inspect: {
        configurable: true,
        value: function() {
          this.writeAsErrorComment("ERROR: 'Inspect' not yet implemented on remote scratchpad");
        }
      },
      reloadAndRun: {
        configurable: true,
        value: function() {
          this.writeAsErrorComment("ERROR: 'Reload and Run' not yet implemented on remote scratchpad");
        }
      },
      display: {
        configurable: true,
        value: function() {
          this._evalInSandbox((function onResponse(pkt) {
            if (pkt.error) {
              this.writeAsErrorComment(pkt.error);
              return;
            }

            let data = pkt.scratchpad;
            this._setTitle(data.name, data.location);

            if (!data.error) {
              this.writeAsComment(data.result);
            } else {
                this.writeAsErrorComment(data.error);
            }
          }).bind(this));
        }
      },
      openPropertyPanel: {
        configurable: true,
        value: function () { },
      },
      chromeSandbox: {
        configurable: true,
        get: function() { }
      },
      contentSandbox: {
        configurable: true,
        get: function() { }
      },
      openScratchpad: {
        configurable: true,
        value: function() {
          return open.call(this)
        }
      }
    });
  });

  return window;
}

module.exports = Scratchpad;
