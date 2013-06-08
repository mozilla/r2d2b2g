/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <stddef.h>
#include "adb.h"
#include "array_lists.h"

#include "adb_thread_ptr_array_list.h"
#include "str_array_list.h"
#include "int_array_list.h"

#define TYPE adb_thread_t *
#define TYPE_NAME adb_thread_ptr_array_list
#include "array_list_define.h"
#undef TYPE
#undef TYPE_NAME

#define TYPE char *
#define TYPE_NAME str_array_list
#include "array_list_define.h"
#undef TYPE
#undef TYPE_NAME

#define TYPE int
#define TYPE_NAME int_array_list
#include "array_list_define.h"
#undef TYPE
#undef TYPE_NAME

#define TYPE tmsg *
#define TYPE_NAME tmsg_ptr_array_list
#include "array_list_define.h"
#undef TYPE
#undef TYPE_NAME

