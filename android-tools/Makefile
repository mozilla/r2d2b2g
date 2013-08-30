ifeq ($(OS), Windows_NT)
  LIB_TARGET = winlib
else
  LIB_TARGET = nixlib
endif

all:
	$(MAKE) -C adb-bin
adb:
	$(MAKE) -C adb-bin adb
clean:
	$(MAKE) -C adb-bin clean
lib:
	$(MAKE) -C adb-bin $(LIB_TARGET)
driver:
	if [ "$(LIB_TARGET)" = "winlib" ]; then \
	  $(MAKE) -C adb-win-api; \
  fi

package:
	$(MAKE) -C adb-bin package
