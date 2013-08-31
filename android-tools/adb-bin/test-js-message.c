#include "js_message.h"

#ifdef _WIN32
#include <Windows.h>
#define DLL_EXPORT _declspec(dllexport)
#else
#define DLL_EXPORT
#endif


DLL_EXPORT void install_js_msg(FunctionJsMsg js_msg) {
  _install_js_msg(js_msg);
}

DLL_EXPORT int call_test1() {
  void * res;
  struct test1_msg {
    int x;
    int y;
  };
  struct test1_msg m = { 27, 3 };
  res = send_js_msg("test1", &m);
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
  res = send_js_msg("test2", &m);
  return (char *)res;
}

DLL_EXPORT int call_garbage() {
  void * res;
  struct garbage_msg {
    char * s;
  };
  struct garbage_msg g = { "_" };
  res = send_js_msg("s", &g);
  return (int)res;
}
