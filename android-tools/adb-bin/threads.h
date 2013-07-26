#ifndef THREADS_H
#define THREADS_H

#include "adb.h"

void * server_thread(void * args);
#ifdef __APPLE__
void * RunLoopThread(void * unused);
#else
void * device_poll_thread(void * unused);
#endif
void * output_thread(void * _t, struct dll_io_bridge *);
void * input_thread(void * _t, struct dll_io_bridge *);

#endif

