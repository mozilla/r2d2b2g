#include "js_message.h"
#include <cutils/threads.h>
#include <stdlib.h>

// Function pointers and data pointers may not be the same size. Create a
// wrapper structure to hold the function pointer and then store the pointer to
// the stucture in the thread local value.
struct func_ptr {
  FunctionJsMsg func;
};

static thread_store_t js_msg_key = THREAD_STORE_INITIALIZER;

void* send_js_msg(char* channel, void* instance_ptr) {
  struct func_ptr* wrapper = (struct func_ptr*) thread_store_get(&js_msg_key);
  FunctionJsMsg js_msg = wrapper->func;
  void* temp = js_msg(channel, (void*)instance_ptr);
  return temp;
}

static void free_js_msg(void* value) {
  free(value);
  value = NULL;
}

void _install_js_msg(FunctionJsMsg js_msg_) {
  struct func_ptr* wrapper = (struct func_ptr*) malloc(sizeof(struct func_ptr));
  wrapper->func = js_msg_;
  // TODO: Fix this memory leak by figuring out why there is bad access when the
  // destructor calls free_js_msg (even if the function is empty).
  thread_store_set(&js_msg_key, wrapper, /* free_js_msg */ NULL);
}
