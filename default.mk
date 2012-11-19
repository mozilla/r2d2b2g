# The latest stable nightly Aurora build of B2G for Unagi according to
# https://releases.mozilla.com/b2g/promoted_to_stable/ (private URL).
ifeq ($(SYS),WINNT)
  # Should be 2012-11-14, but the Windows build failed that day.
  DATE = 2012-11-15
else
  DATE = 2012-11-14
endif
