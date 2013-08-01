/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef JS_MESSAGE_H
#define JS_MESSAGE_H

#define MSG(save, channel, instance) do {\
    *save = js_msg(channel, (void *)&instance);\
  } while(0)

#endif

