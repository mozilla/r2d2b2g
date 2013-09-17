/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef JS_MESSAGE_H
#define JS_MESSAGE_H

#ifdef __cplusplus
extern "C" {
#endif

typedef void* (*FunctionJsMsg)(char*, void*);

void* send_js_msg(char* channel, void* instance_ptr);

void _install_js_msg(FunctionJsMsg js_msg_);

#ifdef __cplusplus
}
#endif

#endif
