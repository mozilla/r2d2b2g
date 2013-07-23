/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// no guard because this will be included every time a new type is declared
// #define TYPE int to declare an int_array_list etc.

#ifndef TYPE
#error make sure you define TYPE before importing array_list.h
#endif
#ifndef TYPE_NAME
#error make sure you define TYPENAME before importing array_list.h
#endif

#include <stdlib.h>

#define _MAKE_FUNC(a, b) a##_##b
#define MAKE_FUNC(a, b) _MAKE_FUNC(a, b)

typedef struct TYPE_NAME {
  int _capacity;
  int length;
  TYPE * base;
  struct TYPE_NAME * (*add)(struct TYPE_NAME *, TYPE);
} TYPE_NAME;


extern TYPE_NAME * MAKE_FUNC(new, TYPE_NAME) (int initialCapacity);
extern void MAKE_FUNC(free, TYPE_NAME) (TYPE_NAME * l);

#undef MAKE_FUNC
#undef _MAKE_FUNC

