/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

const { Ci, Cu, Cr } = require("chrome");

const { AppsUtils, ManifestHelper } = Cu.import("resource://gre/modules/AppsUtils.jsm");
const { Services } = Cu.import("resource://gre/modules/Services.jsm");
const { PermissionsTable, expandPermissions } = Cu.import("resource://gre/modules/PermissionsTable.jsm");
const { defer } = require('sdk/core/promise');

exports.validateAppCache = function(errors, warnings, rawManifest, origin) {
  let deferred = defer();

  // Use ManifestHelper to normalize and retrieve the absolute appcache URI
  let manifest = new ManifestHelper(rawManifest, origin);
  if (!manifest.appcache_path) {
    deferred.resolve();
    return deferred.promise;
  }
  let path = manifest.fullAppcachePath();
  let uri = Services.io.newURI(path, null, null);

  // Appcache only accepts http/https uris
  // http://hg.mozilla.org/mozilla-central/file/c80dc6ffe865/uriloader/prefetch/nsOfflineCacheUpdate.cpp#l1249
  if (uri.scheme != "http" && uri.scheme != "https") {
    errors.push("Appcache only accepts http/https URIs");
    deferred.resolve();
  } else {
    // Appcache reject any redirect
    // http://hg.mozilla.org/mozilla-central/file/044d554846ff/uriloader/prefetch/nsOfflineCacheUpdate.cpp#l292
    let channel = Services.io.newChannel(uri.spec, null, null);
    let listener = new ChannelListener(function (redirectedURI, status) {
      if (redirectedURI) {
        errors.push("Redirected appcache manifests are ignored. " + uri.spec +
                    " has been redirected to " + redirectedURI);
      }
      // Appcache does various check for nsIHttpChannel.requestSucceeded,
      // which is equivalent to checking if status code isn't 2XX
      if (Math.floor(status / 100) != 2)
        errors.push("Appcache URL (" + uri.spec + ") returns a " + status +
                    " HTTP status code and will be ignored");
      deferred.resolve();
    });
    channel.asyncOpen(listener, null);
    channel.notificationCallbacks = listener;
  }

  return deferred.promise;
}

// nsIStreamListener+nsIChannelEventSink instance to check if a given nsIChannel
// is being explicitly redirected. `onDone` function will be called
// when the channel is loaded and receive two arguments:
// * a string representing the URL to which the request was redirected,
//   or null if the request wasn't redirected
// * the http status code
function ChannelListener(onDone) {
  this.redirected = false;
  this.onDone = onDone;
}
ChannelListener.prototype = {
  onStartRequest: function(request, context) {},
  onDataAvailable: function(request, context, stream, offset, count) {},
  onStopRequest: function(request, context, status) {
    request.QueryInterface(Ci.nsIHttpChannel);
    this.onDone(this.redirected ? request.URI.spec : false,
                request.responseStatus);
  },

  QueryInterface: function(iid) {
    if (iid.equals(Ci.nsISupports) ||
        iid.equals(Ci.nsIFactory) ||
        iid.equals(Ci.nsIChannelEventSink) ||
        iid.equals(Ci.nsIStreamListener))
      return this;
    throw Cr.NS_ERROR_NO_INTERFACE;
  },
  createInstance: function(outer, iid) {
    if (outer)
      throw Cr.NS_ERROR_NO_AGGREGATION;
    return this.QueryInterface(iid);
  },
  lockFactory: function(lock) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  asyncOnChannelRedirect: function(oldChan, newChan, flags, callback) {
    // Ignore redirection due to internal implementation reasons
    if (!(flags & Ci.nsIChannelEventSink.REDIRECT_INTERNAL)) {
      this.redirected = true;
    }
    // Accept the redirect in order to ensure onStopRequest to be called
    callback.onRedirectVerifyCallback(Cr.NS_OK);
    return Cr.NS_OK;
  },

  getInterface: function eventsink_gi(iid) {
    if (iid.equals(Ci.nsIChannelEventSink))
      return this;
    throw Cr.NS_ERROR_NO_INTERFACE;
  }
};


exports.validateNameIcons = function(errors, warnings, manifest, app) {
  if (!manifest.name) {
    errors.push("Missing mandatory 'name' in Manifest.");
  }
  // update name visible in the dashboard
  app.name = manifest.name;

  if (!manifest.icons || Object.keys(manifest.icons).length == 0) {
    warnings.push("Missing 'icons' in Manifest.");
  } else {
    // update registered app icon
    let size = Object.keys(manifest.icons).sort(function(a, b) b - a)[0] || null;
    if (size) {
      app.icon = manifest.icons[size];
    }

    // NOTE: add warnings if 128x128 icon is missing
    if (!manifest.icons["128"]) {
      warnings.push("app submission to the Marketplace needs at least an 128 icon");
    }
  }
}

exports.validateManifest = function (errors, warnings, manifest) {
  let valid = AppsUtils.checkManifest(manifest, {});

  if (!valid) {
    errors.push("This app can't be installed on a production device "+
                "(AppsUtils.checkManifest return false).");
  }
}

exports.validateType = function (errors, warnings, manifest, app) {
  let appType = manifest.type || "web";
  if (["web", "privileged", "certified"].indexOf(appType) === -1) {
    errors.push("Unknown app type: '" + appType + "'.");
  } else if (["generated", "hosted"].indexOf(app.type) !== -1 &&
             ["certified", "privileged"].indexOf(manifest.type) !== -1) {
    errors.push("Hosted App can't be type '" + manifest.type + "'.");
  }

  // certified app are not fully supported on the simulator
  if (manifest.type === "certified") {
    warnings.push("'certified' apps are not fully supported on the Simulator.");
  }
}

exports.validatePermissions = function(errors, warnings, manifest) {
  if (!manifest.permissions) {
    return;
  }

  let permissionsNames = Object.keys(manifest.permissions);

  let formatMessage = function (apiName) {
    return "WebAPI '"+ apiName + "' is not currently supported on the Simulator";
  };

  // WebSMS is not currently supported on the simulator
  if (permissionsNames.indexOf("sms") > -1) {
    warnings.push(formatMessage("WebSMS"));
  }

  // WebTelephony is not currently supported on the simulator
  if (permissionsNames.indexOf("telephony") > -1) {
    warnings.push(formatMessage("WebTelephony"));
  }

  let appType = manifest.type || "web";
  let appStatus;
  // NOTE: If it isn't certified or privileged, it's appStatus "app"
  // https://hg.mozilla.org/releases/mozilla-b2g18/file/d9278721eea1/dom/apps/src/PermissionsTable.jsm#l413
  if (["privileged", "certified"].indexOf(appType) === -1) {
    appStatus = "app";
  } else {
    appStatus = appType;
  }

  permissionsNames.forEach(function(name) {
    let permission = PermissionsTable[name];

    if (permission) {
      let permissionAction = permission[appStatus];
      if (!permissionAction) {
        errors.push("Ignored permission '" + name + "' (invalid app type '" + appType + "').");
      } else if (permissionAction === Ci.nsIPermissionManager.DENY_ACTION) {
        errors.push("Denied permission '" + name + "' for app type '" + appType + "'.");
      } else {
        let access = manifest.permissions[name].access;
        try {
          if (access && expandPermissions(name, access).length === 0) {
            errors.push("Invalid access '" + access + "' in permission '" + name + "'.");
          }
        } catch(e) {
          errors.push("Invalid access '" + access + "' in permission '" + name + "'.");
        }
      }
    } else {
      errors.push("Unknown permission '" + name + "'.");
    }
  });
}
