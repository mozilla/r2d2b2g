ifeq ($(OS), Windows_NT)
  LIB_TARGET = winlib
else
  LIB_TARGET = nixlib
endif

build: lib

driver:
	if [ "$(LIB_TARGET)" = "winlib" ]; then \
	  $(MAKE) -C adb-win-api; \
	fi
lib: driver
	$(MAKE) -C adb-bin $(LIB_TARGET)
adb: driver
	$(MAKE) -C adb-bin adb

clean:
	$(MAKE) -C adb-bin clean

package:
	$(MAKE) -C adb-bin package
