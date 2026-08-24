cmake_minimum_required(VERSION 3.24)

set(CMAKE_OSX_DEPLOYMENT_TARGET "13.0" CACHE STRING "Minimum supported macOS version")

project(MGFX VERSION 1.0 LANGUAGES CXX OBJCXX)

if(NOT APPLE)
    message(FATAL_ERROR "MetalTriangle requires macOS and Xcode command-line tools")
endif()

include(FetchContent)

set(METAL_CPP_DIR "" CACHE PATH "Path to a local checkout of apple/metal-cpp")
if(METAL_CPP_DIR)
    set(metal_cpp_SOURCE_DIR "${METAL_CPP_DIR}")
else()
    FetchContent_Declare(
        metal_cpp
        GIT_REPOSITORY https://github.com/apple/metal-cpp.git
        GIT_TAG 27c4382b7151d55a51692cdcb27aaa98752240de
        GIT_SHALLOW FALSE
    )
FetchContent_MakeAvailable(metal_cpp)
endif()

FetchContent_Declare(
    earcut_hpp
    GIT_REPOSITORY https://github.com/mapbox/earcut.hpp.git
    GIT_TAG v2.2.4
    GIT_SHALLOW TRUE
    SOURCE_SUBDIR include
)
FetchContent_MakeAvailable(earcut_hpp)

find_library(APPKIT_FRAMEWORK AppKit REQUIRED)
find_library(FOUNDATION_FRAMEWORK Foundation REQUIRED)
find_library(METAL_FRAMEWORK Metal REQUIRED)
find_library(METALKIT_FRAMEWORK MetalKit REQUIRED)
find_library(QUARTZCORE_FRAMEWORK QuartzCore REQUIRED)
find_library(CORETEXT_FRAMEWORK CoreText REQUIRED)
find_library(COREGRAPHICS_FRAMEWORK CoreGraphics REQUIRED)

execute_process(
    COMMAND xcrun -sdk macosx metal -v
    RESULT_VARIABLE MGFX_METAL_COMPILER_RESULT
    OUTPUT_QUIET
    ERROR_QUIET
)
if(MGFX_METAL_COMPILER_RESULT EQUAL 0)
    set(MGFX_SHADER_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/shaders")
    set(MGFX_SHADER_AIR "${MGFX_SHADER_DIRECTORY}/Triangle.air")
    set(MGFX_SHADER_RESOURCE "${MGFX_SHADER_DIRECTORY}/default.metallib")
    add_custom_command(
        OUTPUT "${MGFX_SHADER_RESOURCE}"
        COMMAND "${CMAKE_COMMAND}" -E make_directory "${MGFX_SHADER_DIRECTORY}"
        COMMAND xcrun -sdk macosx metal -c
                "${CMAKE_CURRENT_SOURCE_DIR}/shaders/Triangle.metal"
                -o "${MGFX_SHADER_AIR}"
        COMMAND xcrun -sdk macosx metallib
                "${MGFX_SHADER_AIR}"
                -o "${MGFX_SHADER_RESOURCE}"
        DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/shaders/Triangle.metal"
        COMMENT "Compiling MGFX Metal shaders"
        VERBATIM
    )
    set_source_files_properties("${MGFX_SHADER_RESOURCE}" PROPERTIES GENERATED TRUE)
    set(MGFX_PRECOMPILED_SHADERS 1)
else()
    set(MGFX_SHADER_RESOURCE "${CMAKE_CURRENT_SOURCE_DIR}/shaders/Triangle.metal")
    set_source_files_properties("${MGFX_SHADER_RESOURCE}" PROPERTIES HEADER_FILE_ONLY TRUE)
    set(MGFX_PRECOMPILED_SHADERS 0)
    message(WARNING "Metal Toolchain is unavailable; shaders will compile at runtime")
endif()
set_source_files_properties("${MGFX_SHADER_RESOURCE}" PROPERTIES
    MACOSX_PACKAGE_LOCATION Resources
)

add_executable(MGFXServer MACOSX_BUNDLE
    src/main.mm
    src/GraphicsProtocol.cpp
    src/GraphicsProtocol.hpp
    src/GraphicsServer.cpp
    src/GraphicsServer.hpp
    src/LocalIPC.cpp
    src/LocalIPC.hpp
    src/Renderer.cpp
    src/Renderer.hpp
    src/SystemText.mm
    src/SystemText.hpp
    src/TextGeometryCache.hpp
    src/VectorPath.cpp
    src/VectorPath.hpp
    src/MetalCpp.cpp
    "${MGFX_SHADER_RESOURCE}"
)

add_executable(MGFXDemo
    src/DemoClient.cpp
    src/GraphicsProtocol.cpp
    src/LocalIPC.cpp
    src/UI.cpp
)
target_compile_features(MGFXDemo PRIVATE cxx_std_17)
target_include_directories(MGFXDemo PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/src")
target_compile_options(MGFXDemo PRIVATE -Wall -Wextra -Wpedantic)

target_compile_features(MGFXServer PRIVATE cxx_std_17)
target_compile_definitions(MGFXServer PRIVATE
    MGFX_PRECOMPILED_SHADERS=${MGFX_PRECOMPILED_SHADERS}
)
target_include_directories(MGFXServer PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}/src"
)
target_include_directories(MGFXServer SYSTEM PRIVATE "${metal_cpp_SOURCE_DIR}")
target_include_directories(MGFXServer SYSTEM PRIVATE "${earcut_hpp_SOURCE_DIR}/include")
target_compile_options(MGFXServer PRIVATE
    "$<$<COMPILE_LANGUAGE:CXX,OBJCXX>:-Wall;-Wextra;-Wpedantic>"
    "$<$<COMPILE_LANGUAGE:OBJCXX>:-fobjc-arc>"
)
target_link_libraries(MGFXServer PRIVATE
    ${APPKIT_FRAMEWORK}
    ${FOUNDATION_FRAMEWORK}
    ${METAL_FRAMEWORK}
    ${METALKIT_FRAMEWORK}
    ${QUARTZCORE_FRAMEWORK}
    ${CORETEXT_FRAMEWORK}
    ${COREGRAPHICS_FRAMEWORK}
)

set_target_properties(MGFXServer PROPERTIES
    MACOSX_BUNDLE_BUNDLE_NAME "MGFX Graphics Server"
    MACOSX_BUNDLE_GUI_IDENTIFIER "dev.mgfx.server"
    MACOSX_BUNDLE_SHORT_VERSION_STRING "${PROJECT_VERSION}"
    MACOSX_BUNDLE_BUNDLE_VERSION "1"
    XCODE_ATTRIBUTE_CLANG_ENABLE_OBJC_ARC YES
    XCODE_ATTRIBUTE_PRODUCT_BUNDLE_IDENTIFIER "dev.mgfx.server"
)

include(CTest)
if(BUILD_TESTING)
    add_executable(GraphicsProtocolTests
        tests/GraphicsProtocolTests.cpp
        src/GraphicsProtocol.cpp
    )
    target_compile_features(GraphicsProtocolTests PRIVATE cxx_std_17)
    target_include_directories(GraphicsProtocolTests PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/src")
    target_compile_options(GraphicsProtocolTests PRIVATE -Wall -Wextra -Wpedantic)
    add_test(NAME graphics_protocol_round_trip COMMAND GraphicsProtocolTests)

    add_executable(UISystemTests
        tests/UISystemTests.cpp
        src/UI.cpp
        src/GraphicsProtocol.cpp
    )
    target_compile_features(UISystemTests PRIVATE cxx_std_17)
    target_include_directories(UISystemTests PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/src")
    target_compile_options(UISystemTests PRIVATE -Wall -Wextra -Wpedantic)
    add_test(NAME ui_layout_and_paint COMMAND UISystemTests)

    add_executable(LocalIPCTests
        tests/LocalIPCTests.cpp
        src/LocalIPC.cpp
    )
    target_compile_features(LocalIPCTests PRIVATE cxx_std_17)
    target_include_directories(LocalIPCTests PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/src")
    target_compile_options(LocalIPCTests PRIVATE -Wall -Wextra -Wpedantic)
    add_test(NAME local_ipc_round_trip COMMAND LocalIPCTests)

    add_executable(VectorPathTests
        tests/VectorPathTests.cpp
        src/VectorPath.cpp
    )
    target_compile_features(VectorPathTests PRIVATE cxx_std_17)
    target_include_directories(VectorPathTests PRIVATE
        "${CMAKE_CURRENT_SOURCE_DIR}/src"
    )
    target_include_directories(VectorPathTests SYSTEM PRIVATE "${earcut_hpp_SOURCE_DIR}/include")
    target_compile_options(VectorPathTests PRIVATE -Wall -Wextra -Wpedantic)
    add_test(NAME vector_path_tessellation COMMAND VectorPathTests)

    add_executable(SystemTextTests
        tests/SystemTextTests.mm
        src/SystemText.mm
        src/VectorPath.cpp
    )
    target_compile_features(SystemTextTests PRIVATE cxx_std_17)
    target_include_directories(SystemTextTests PRIVATE
        "${CMAKE_CURRENT_SOURCE_DIR}/src"
    )
    target_include_directories(SystemTextTests SYSTEM PRIVATE "${earcut_hpp_SOURCE_DIR}/include")
    target_compile_options(SystemTextTests PRIVATE -Wall -Wextra -Wpedantic -fobjc-arc)
    target_link_libraries(SystemTextTests PRIVATE
        ${APPKIT_FRAMEWORK}
        ${FOUNDATION_FRAMEWORK}
        ${CORETEXT_FRAMEWORK}
        ${COREGRAPHICS_FRAMEWORK}
    )
    add_test(NAME system_text_shaping COMMAND SystemTextTests)
endif()
