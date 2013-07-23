ifeq ($(OS), Windows_NT)
  LIB_TARGET = winlib
else
  LIB_TARGET = nixlib
endif

all:
	make -C adb-bin
adb:
	make -C adb-bin adb
clean:
	make -C adb-bin clean
lib:
	make -C adb-bin $(LIB_TARGET)
