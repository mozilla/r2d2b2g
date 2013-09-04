/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Declares all array lists
 *
 * To declare a new array list:
 *
 * 1. Make a new TYPE_array_list.h file (example: TYPE=int)
 *  #ifndef INT_ARRAY_LIST_H
 *  #define INT_ARRAY_LIST_H
 *
 *  #define TYPE int
 *  #define TYPE_NAME int_array_list
 *  #include "array_list.h"
 *  #undef TYPE
 *  #undef TYPE_NAME
 *
 *  #endif
 *
 * 2. Add TYPE_array_list to array_lists.h
 * 3. Add a definition to this file (see examples below)
 * 4. Now you can use your array_list whereever you include "array_lists.h"
 *
 * API
 * Create:
 *    str_array_list * ss = new_str_array_list(20);
 *
 * Add:
 *    ss->add("hello");
 *
 * Read/Write:
 *    ss->base[i]
 *
 * Free:
 *    free_str_array_list(__adb_tags_active);
 *
 */

#include <stddef.h>
#include "adb.h"
#include "array_lists.h"

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

