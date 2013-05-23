/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

this.EXPORTED_SYMBOLS = [ "switchToB2GAgentSheet" ];

Cu.import("resource://gre/modules/Services.jsm");

let URL = Services.io.newURI("chrome://prosthesis/content/b2g.css", null, null);

let trackedIframes = new WeakMap();

/**
 * Switch to b2g agent sheet, à la mobile.
 *
 * @param iframe the targeted iframe.
 *
 */
this.switchToB2GAgentSheet = function switchToB2GAgentSheet(iframe) {
  let mgr = trackedIframes.get(iframe);
  if (!mgr) {
    mgr = new B2GAgentSheetManager(iframe);
  }
  mgr.injectAgentSheet();
}

function B2GAgentSheetManager(iframe) {
  trackedIframes.set(iframe, this);

  this.attachedElement = iframe;

  this.reset = this.reset.bind(this);
  this.injectAgentSheet = this.injectAgentSheet.bind(this);

  this.attachedElement.addEventListener("unload", this.reset, true);
  this.attachedElement.addEventListener("load", this.injectAgentSheet, true);
}

B2GAgentSheetManager.prototype = {
  get win() {
    return this.attachedElement.contentWindow;
  },

  /*
   * Change the look of the scrollbars.
   */
  injectAgentSheet: function(noDeep) {
    let windows;
    if (noDeep) {
      windows = [this.win];
    } else {
      windows = this.getInnerWindows(this.win);
    }
    windows.forEach(this.injectStyleSheet);
    this.forceStyle();
  },


  /*
   * Reset the look of the scrollbars.
   */
  reset: function() {
    let windows = this.getInnerWindows(this.win);
    windows.forEach(this.removeStyleSheet);
    this.forceStyle(this.attachedElement);
    this.attachedElement.removeEventListener("load", this.injectAgentSheet, true);
    this.attachedElement.removeEventListener("unload", this.reset, true);
    trackedIframes.delete(this.attachedElement);
  },

  /*
   * Toggle the display property of the window to force the style to be applied.
   */
  forceStyle: function() {
    let parentWindow = this.attachedElement.ownerDocument.defaultView;
    let style = parentWindow.getComputedStyle(this.attachedElement);
    if (style) {
      let display = style.display; // Save display value
      this.attachedElement.style.display = "none";
      style.display; // Flush
      this.attachedElement.style.display = display; // Restore
    }
  },

  /*
   * return all the window objects present in the hiearchy of a window.
   */
  getInnerWindows: function(win) {
    let iframes = win.document.querySelectorAll("iframe");

    let innerWindows = [];
    for (let iframe of iframes) {
      innerWindows = innerWindows.concat(this.getInnerWindows(iframe.contentWindow));
    }
    return [win].concat(innerWindows);
  },

  /*
   * Append the new scrollbar style.
   */
  injectStyleSheet: function(win) {
    let winUtils = win.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowUtils);
    try {
      winUtils.loadSheet(URL, winUtils.AGENT_SHEET);
    }catch(e) {}
  },

  /*
   * Remove the injected stylesheet.
   */
  removeStyleSheet: function(win) {
    let winUtils = win.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowUtils);
    try {
      winUtils.removeSheet(URL, win.AGENT_SHEET);
    }catch(e) {}
  },
}
