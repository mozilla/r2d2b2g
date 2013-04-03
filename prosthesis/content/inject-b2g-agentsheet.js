/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const B2G_AGENTSHEET_URL =
  Services.io.newURI("chrome://prosthesis/content/b2g.css", null, null);

// inject b2g mobile agent stylesheet into
// all next content DOM windows created
Services.obs.addObserver(
  function _injectStylesheet(subject, topic, data) {
    debug("injectStylesheet:", data);
    let winUtils = subject.QueryInterface(Ci.nsIInterfaceRequestor).
      getInterface(Ci.nsIDOMWindowUtils);
    winUtils.loadSheet(B2G_AGENTSHEET_URL, winUtils.AGENT_SHEET);
  },
  "content-document-global-created",
  false
);
