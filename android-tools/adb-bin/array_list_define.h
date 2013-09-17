/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

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

static TYPE_NAME * MAKE_FUNC(TYPE_NAME, add) (TYPE_NAME * l, TYPE x) {
  if (l->_capacity == l->length) {
    l->base = (TYPE *)realloc(l->base, sizeof(TYPE)*l->_capacity*2);
    l->_capacity *= 2;
  }
  l->base[l->length++] = x;
  return l;
}

TYPE_NAME * MAKE_FUNC(new, TYPE_NAME) (int initialCapacity) {
  TYPE_NAME * list = (TYPE_NAME *)malloc(sizeof(TYPE_NAME));
  list->base = (TYPE *)malloc(sizeof(TYPE)*initialCapacity);
  list->add = MAKE_FUNC(TYPE_NAME, add);
  list->length = 0;
  list->_capacity = initialCapacity;
  return list;
}

void MAKE_FUNC(free, TYPE_NAME) (TYPE_NAME * l) {
  free(l->base);
  free(l);
}

#undef MAKE_FUNC
#undef _MAKE_FUNC

