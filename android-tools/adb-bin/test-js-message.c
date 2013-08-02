#include "js_message.h"

#ifdef __cplusplus
  #define EXTERN_C extern "C"
#else
  #define EXTERN_C
#endif

#ifdef _WIN32
#include <Windows.h>
#define DLL_EXPORT EXTERN_C _declspec(dllexport)
#define THREAD_LOCAL _declspec(thread)
#else
#define THREAD_LOCAL __thread
#define DLL_EXPORT
#endif

THREAD_LOCAL void * (*js_msg)(char *, void *);

DLL_EXPORT void install_js_msg(void * (*js_msg_)(char *, void *)) {
  js_msg = js_msg_;
}

DLL_EXPORT int call_test1() {
  void * res;
  struct test1_msg {
    int x;
    int y;
  };
  struct test1_msg m = { 27, 3 };
  res = MSG("test1", &m);
  return (int)res;
}

DLL_EXPORT char * call_test2() {
  void * res;
  struct test2_msg {
    int a;
    char * b;
    int c;
  };
  struct test2_msg m = { 11, "hello", 72 };
  res = MSG("test2", &m);
  return (char *)res;
}

DLL_EXPORT int call_garbage() {
  void * res;
  struct garbage_msg {
    char * s;
  };
  struct garbage_msg g = { "_" };
  res = MSG("s", &g);
  return (int)res;
}

