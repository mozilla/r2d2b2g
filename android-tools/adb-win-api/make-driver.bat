set DDK_PATH=C:\WinDDK\7600.16385.1
REM MAKEFLAGS needs to be wiped because when this is executed after a chain of
REM     `make -C xxx` it is set incorrectly
set MAKEFLAGS=
pushd "%DDK_PATH%\bin"
setenv.bat %DDK_PATH% fre WXP & popd & pushd api & build -cbeEIFZ & popd & pushd winusb & build -cbeEIFZ
