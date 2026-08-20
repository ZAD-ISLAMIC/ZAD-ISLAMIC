# JNI wrapper for the transcribe.cpp C API (Moonshine STT).
#
# Built standalone (NOT as a subdirectory of transcribe.cpp) so the vendored
# upstream keeps its own top-level CMake project and pristine include paths.
# The 4 engine libraries (libtranscribe, libggml, libggml-base, libggml-cpu)
# are produced by building `transcribe.cpp` with TRANSCRIBE_BUILD_SHARED=ON,
# then the wrapper links against the resulting libtranscribe.so.

cmake_minimum_required(VERSION 3.22)
project(moonshine_stt LANGUAGES CXX)

# Location of the vendored upstream source (resolved from this file).
get_filename_component(TRANSCRIBE_SRC "${CMAKE_CURRENT_LIST_DIR}/../transcribe.cpp" ABSOLUTE)

add_library(moonshine_stt SHARED
  "${CMAKE_CURRENT_LIST_DIR}/../../jni/moonshine_jni.cpp"
)
set_target_properties(moonshine_stt PROPERTIES OUTPUT_NAME moonshine_stt)

target_include_directories(moonshine_stt PRIVATE "${TRANSCRIBE_SRC}/include")

# Path to the already-built engine library (set by the orchestrating script).
# ../../build/engine/src is the engine build tree next to this plugin's native/.
set(TSC_LIB "${CMAKE_CURRENT_LIST_DIR}/../build/engine/src/libtranscribe.so")
if(NOT EXISTS "${TSC_LIB}")
  message(FATAL_ERROR "libtranscribe.so not found at ${TSC_LIB} — build transcribe.cpp first (build.mjs does this)")
endif()

target_link_libraries(moonshine_stt PRIVATE
  "${TSC_LIB}"
  log
)

# Match the NDK's default libc++ ABI posture of the prebuilt plugin:
# libc++_shared.so is a first-class dependency for the wrapper.
target_link_options(moonshine_stt PRIVATE "-lc++_shared")