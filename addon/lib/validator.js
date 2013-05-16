/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

const { Ci, Cu, Cr } = require("chrome");

const AppsUtils = Cu.import("resource://gre/modules/AppsUtils.jsm");
const { Services } = Cu.import("resource://gre/modules/Services.jsm");
const { defer } = require('sdk/core/promise');

exports.validateAppCache = function(errors, warnings, rawManifest, origin) {
  let deferred = defer();

  // Use ManifestHelper to normalize and retrieve the absolute appcache URI
  let manifest = new AppsUtils.ManifestHelper(rawManifest, origin);
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
