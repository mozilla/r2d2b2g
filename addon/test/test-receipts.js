/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { getActiveTab, getTabContentWindow, closeTab } = require("sdk/tabs/utils");
const { getMostRecentBrowserWindow } = require("sdk/window/utils");
const { nsHttpServer } = require("sdk/test/httpd");

const MOCK_MANIFEST_URL = "http://localhost:8099/test_app/webapp.manifest";

const updatedReceiptType = "ok";

function manifestHandler(req, res) {
  res.setHeader("Content-Type", "application/x-web-app-manifest+json");
  res.write(JSON.stringify({
    "name": "Simulator Test App",
    "description": "The best mock app in existence"
  }));
};

function indexHandler(req, res) {
  res.setHeader("Content-Type", "text/html");
  res.write('<!DOCTYPE html><html><head><meta charset="utf-8" /></head>' +
            '<body><p>Hello World!</p></body></html>');
};

function appFirstListed({ target, event, onInstall, onUpdate, equal }) {
  let appInstalled = false;
  let appUpdated = false;
  target.addEventListener(event, function onEvent(evt) {
    let message = evt.detail;
    if (message.name === "updateSingleApp") {
      let app = message.app;
      if (!appInstalled) {
        appInstalled = true;
        onInstall();
      } else if (app.receipt && app.receiptType === updatedReceiptType) {
        // Need at least one assertion so test is not empty.
        equal(app.receiptType, updatedReceiptType, "Receipt type updated");
        if (!appUpdated) {
          appUpdated = true;
        } else {
          console.log("Done cleaning up");
          target.removeEventListener(event, onEvent);
          onUpdate();
        }
      }
    }
  });
};

function updateReceipt(window) {
  return function() {
    console.log("sending updateReceiptType");
    window.postMessage({
      name: "updateReceiptType",
      id: MOCK_MANIFEST_URL,
      receiptType: updatedReceiptType
    }, "*");
  }
}

function cleanUp({ srv, window, done, simulator }) {
  return function clean() {
    window.postMessage({ name: "toggle" }, "*");
    simulator.unload();
    srv.stop(function () {
      window.close();
      done();
    });
  };
}

exports["test receipt update"] = function receiptUpdate(assert, done) {
  const simulator = require("simulator");

  // Start up a test serving serving a locally hosted app.
  let srv = new nsHttpServer();
  srv.registerPathHandler("/test_app/webapp.manifest", manifestHandler);
  srv.registerPathHandler("/", indexHandler);
  try {
    srv.start(8099);
  } catch (e) {
    assert.ok(false, "Error binding to port 8099, did you forget to call " +
                     "simulator.unload?");
    return done();
  }

  // Open the dashboard.
  simulator.openHelperTab(function onOpen(tab) {
    let window = getTabContentWindow(getActiveTab(getMostRecentBrowserWindow()));
    let document = window.document;

    // Once the app is listed, then update it.
    appFirstListed({
      target: document.documentElement,
      event: "addon-message",
      onInstall: updateReceipt(window),
      onUpdate: cleanUp({
        srv: srv,
        window: window,
        done: done,
        simulator: simulator
      }),
      equal: assert.equal.bind(assert)
    });

    // Install a dummy app with receiptType "none".
    window.postMessage({
      name: "addAppByTab",
      url: MOCK_MANIFEST_URL,
      receiptType: "none",
    }, "*");
  });
}

require("sdk/test").run(exports);
