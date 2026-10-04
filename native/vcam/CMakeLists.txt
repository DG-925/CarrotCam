# CarrotCam virtual camera driver (DirectShow source filter + sender API).
cmake_minimum_required(VERSION 3.20)
project(CarrotCamVCam CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
# Static CRT: the DLL is loaded into other apps (Discord, Chrome, Zoom...)
# and must not depend on a VC++ redistributable being installed.
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

file(GLOB BASECLASSES_SRC CONFIGURE_DEPENDS src/baseclasses/*.cpp)
file(GLOB CORE_SRC CONFIGURE_DEPENDS src/softcamcore/*.cpp)

add_library(CarrotCamVCam SHARED
    ${BASECLASSES_SRC}
    ${CORE_SRC}
    src/dll/carrotcam.cpp
    src/dll/carrotcam.def
)
target_include_directories(CarrotCamVCam PRIVATE src src/baseclasses)
target_compile_definitions(CarrotCamVCam PRIVATE
    UNICODE _UNICODE WIN32 NDEBUG _CRT_SECURE_NO_WARNINGS)
target_compile_options(CarrotCamVCam PRIVATE /W3 /O2 /MP /permissive /wd4996 /wd4005)
target_link_libraries(CarrotCamVCam PRIVATE
    strmiids winmm ole32 oleaut32 uuid advapi32 gdi32 user32)
