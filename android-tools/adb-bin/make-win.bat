del "..\win-out\*.*" /F /Q
echo "." > "..\win-out\.exist"

set files=adb.cpp adb_client.cpp file_sync_client.cpp services.cpp transport.cpp transport_local.cpp transport_usb.cpp usb_vendors.cpp utils.cpp exports.cpp usb_windows.cpp get_my_path_windows.cpp declare_array_lists.cpp sysdeps_win32.cpp ..\\libcutils\\list.c
set objs="..\\win-out\\sockets.obj" "..\\win-out\\adb.obj" "..\\win-out\\adb_client.obj" "..\\win-out\\file_sync_client.obj" "..\\win-out\\services.obj" "..\\win-out\\transport.obj" "..\\win-out\\transport_local.obj" "..\\win-out\\transport_usb.obj" "..\\win-out\\usb_vendors.obj" "..\\win-out\\utils.obj" "..\\win-out\\exports.obj" "..\\win-out\\usb_windows.obj" "..\\win-out\\get_my_path_windows.obj" "..\\win-out\\sysdeps_win32.obj" "..\\win-out\\socket_local_client.obj" "..\\win-out\\socket_local_server.obj" "..\\win-out\\list.obj" "..\\win-out\\declare_array_lists.obj"

cl.exe /c /TP /GS /analyze- /W3 /Zc:wchar_t /I"..\include" /I"..\dirent-1.13\include" /ZI /Gm /Od /fp:precise /D "HAVE_WINSOCK" /D "HAVE_WIN32_IPC" /D "HAVE_WIN32_PROC" /D "WIN32" /D "_DEBUG" /D "NO_AUTH" /D "_WINDLL" /D "_UNICODE" /D "UNICODE" /errorReport:prompt /WX- /Zc:forScope /RTC1 /Gd /Oy- /MDd /Fa"..\\win-out\\" /EHsc /nologo /Fo"..\\win-out\\" /Fp"..\win-out\libadb.pch" sockets.c ..\\libcutils\\socket_local_client.c ..\\libcutils\\socket_local_server.c

cl.exe /c /GS /analyze- /W3 /Zc:wchar_t /I"..\include" /I"..\dirent-1.13\include" /ZI /Gm /Od /fp:precise /D "HAVE_WINSOCK" /D "HAVE_WIN32_IPC" /D "HAVE_WIN32_PROC" /D "WIN32" /D "_DEBUG" /D "NO_AUTH" /D "_WINDLL" /D "_UNICODE" /D "UNICODE" /errorReport:prompt /WX- /Zc:forScope /RTC1 /Gd /Oy- /MDd /Fa"..\\win-out\\" /EHsc /nologo /Fo"..\\win-out\\" /Fp"..\win-out\libadb.pch" %files%

link.exe /OUT:"..\win-out\libadb.dll" /MANIFEST /NXCOMPAT /PDB:"..\win-out\libadb.pdb" /DYNAMICBASE "ws2_32.lib" "kernel32.lib" "user32.lib" "gdi32.lib" "winspool.lib" "comdlg32.lib" "advapi32.lib" "shell32.lib" "ole32.lib" "oleaut32.lib" "uuid.lib" "odbc32.lib" "odbccp32.lib" /IMPLIB:"..\win-out\libadb.lib" /DEBUG /DLL /MACHINE:X86 /INCREMENTAL /MANIFESTUAC:"level='asInvoker' uiAccess='false'" /ManifestFile:"..\win-out\libadb.dll.intermediate.manifest" /ERRORREPORT:PROMPT /NOLOGO /LIBPATH:"..\include" /TLBID:1 %objs%

