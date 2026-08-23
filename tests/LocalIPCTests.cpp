#include "LocalIPC.hpp"

#include <cmath>
#include <iostream>
#include <memory>
#include <string>
#include <thread>

#include <unistd.h>

int main() {
    mgfx::ipc::CursorShape cursor{};
    if (!mgfx::ipc::decodeCursor(
            mgfx::ipc::encodeCursor(mgfx::ipc::CursorShape::pointingHand), cursor) ||
        cursor != mgfx::ipc::CursorShape::pointingHand) {
        std::cerr << "Cursor payload round trip failed\n";
        return 1;
    }

    std::uint64_t animationTime = 0;
    if (!mgfx::ipc::decodeAnimationTime(
            mgfx::ipc::encodeAnimationTime(5'016'000'000ULL), animationTime) ||
        animationTime != 5'016'000'000ULL) {
        std::cerr << "Animation timestamp payload round trip failed\n";
        return 1;
    }

    mgfx::ipc::ServerHello hello{};
    constexpr std::uint32_t helloCapabilities =
        mgfx::ipc::ServerCapability::clientWindowLifecycle |
        mgfx::ipc::ServerCapability::pointerInput;
    if (!mgfx::ipc::decodeServerHello(
            mgfx::ipc::encodeServerHello({mgfx::ipc::protocolVersion,
                                          mgfx::ipc::GraphicsBackend::metal,
                                          helloCapabilities}),
            hello) || hello.version != mgfx::ipc::protocolVersion ||
        hello.backend != mgfx::ipc::GraphicsBackend::metal ||
        hello.capabilities != helloCapabilities) {
        std::cerr << "Server hello payload round trip failed\n";
        return 1;
    }
    constexpr std::uint64_t extendedCapabilities =
        0xFFFF'FFFFULL | mgfx::ipc::ServerCapability::capabilityWords64;
    std::uint64_t decodedCapabilities = 0;
    if (!mgfx::ipc::decodeServerCapabilities(
            mgfx::ipc::encodeServerCapabilities(extendedCapabilities), decodedCapabilities) ||
        decodedCapabilities != extendedCapabilities) {
        std::cerr << "Extended server capabilities round trip failed\n";
        return 1;
    }
    mgfx::ipc::ResourceStatus resourceStatus{};
    if (!mgfx::ipc::decodeResourceStatus(mgfx::ipc::encodeResourceStatus(
            {mgfx::ipc::ResourceKind::mesh, mgfx::ipc::ResourceState::ready, 73}),
            resourceStatus) || resourceStatus.kind != mgfx::ipc::ResourceKind::mesh ||
        resourceStatus.state != mgfx::ipc::ResourceState::ready || resourceStatus.id != 73) {
        std::cerr << "Resource status payload round trip failed\n";
        return 1;
    }

    mgfx::ipc::WindowState windowState{};
    if (!mgfx::ipc::decodeWindowState(
            mgfx::ipc::encodeWindowState({mgfx::ipc::WindowMode::fullscreen, false}),
            windowState) || windowState.mode != mgfx::ipc::WindowMode::fullscreen ||
        windowState.resizable) {
        std::cerr << "Window state payload round trip failed\n";
        return 1;
    }

    mgfx::ipc::WindowConfig windowConfig{};
    if (!mgfx::ipc::decodeWindowConfig(
            mgfx::ipc::encodeWindowConfig({1100, 700, 720, 520}), windowConfig) ||
        windowConfig.width != 1100 || windowConfig.height != 700 ||
        windowConfig.minimumWidth != 720 || windowConfig.minimumHeight != 520) {
        std::cerr << "Window config payload round trip failed\n";
        return 1;
    }

    mgfx::ipc::WindowChrome windowChrome{};
    if (!mgfx::ipc::decodeWindowChrome(
            mgfx::ipc::encodeWindowChrome({mgfx::ipc::WindowChromeMode::overlay, 82}),
            windowChrome) || windowChrome.mode != mgfx::ipc::WindowChromeMode::overlay ||
        windowChrome.draggableHeight != 82) {
        std::cerr << "Window chrome payload round trip failed\n";
        return 1;
    }

    mgfx::ipc::WindowChromeMetrics chromeMetrics{};
    if (!mgfx::ipc::decodeWindowChromeMetrics(
            mgfx::ipc::encodeWindowChromeMetrics({132.0F, 28.0F}), chromeMetrics) ||
        chromeMetrics.leadingInset != 132.0F || chromeMetrics.titleBarHeight != 28.0F) {
        std::cerr << "Window chrome metrics payload round trip failed\n";
        return 1;
    }

    mgfx::ipc::TextMeasure textMeasure{};
    if (!mgfx::ipc::decodeTextMeasure(mgfx::ipc::encodeTextMeasure(
            {mgfx::ipc::TextFamily::systemSerif, mgfx::ipc::TextWeight::bold,
             mgfx::ipc::TextStyle::italic, 0.08F, 77, "Árvíztűrő — Ω"}), textMeasure) ||
        textMeasure.family != mgfx::ipc::TextFamily::systemSerif ||
        textMeasure.weight != mgfx::ipc::TextWeight::bold ||
        textMeasure.style != mgfx::ipc::TextStyle::italic ||
        std::fabs(textMeasure.letterSpacing - 0.08F) > 0.00001F ||
        textMeasure.fontResourceId != 77 ||
        textMeasure.text != "Árvíztűrő — Ω") {
        std::cerr << "Native text measurement request round trip failed\n";
        return 1;
    }
    const mgfx::ipc::FontUpload fontUpload{91, {0, 1, 0, 0, 2, 3, 4, 5}};
    mgfx::ipc::FontUpload decodedFont{};
    if (!mgfx::ipc::decodeFontUpload(mgfx::ipc::encodeFontUpload(fontUpload), decodedFont) ||
        decodedFont.id != fontUpload.id || decodedFont.bytes != fontUpload.bytes) {
        std::cerr << "Font resource upload round trip failed\n";
        return 1;
    }
    float textAdvance = 0.0F;
    if (!mgfx::ipc::decodeTextMetrics(mgfx::ipc::encodeTextMetrics(6.25F), textAdvance) ||
        textAdvance != 6.25F) {
        std::cerr << "Native text metrics response round trip failed\n";
        return 1;
    }

    mgfx::ipc::TextureUpload texture{};
    const mgfx::ipc::TextureUpload sourceTexture{9, 2, 1,
        {255, 0, 0, 255, 0, 255, 0, 255}};
    if (!mgfx::ipc::decodeTextureUpload(mgfx::ipc::encodeTextureUpload(sourceTexture), texture) ||
        texture.id != 9 || texture.width != 2 || texture.height != 1 ||
        texture.rgba != sourceTexture.rgba) {
        std::cerr << "Texture upload payload round trip failed\n";
        return 1;
    }

    const mgfx::ipc::PathUpload sourcePath{12, {
        {mgfx::ipc::PathVerb::moveTo, {0.0F, 0.0F}},
        {mgfx::ipc::PathVerb::lineTo, {24.0F, 24.0F}},
        {mgfx::ipc::PathVerb::close, {}},
    }};
    mgfx::ipc::PathUpload decodedPath{};
    if (!mgfx::ipc::decodePathUpload(mgfx::ipc::encodePathUpload(sourcePath), decodedPath) ||
        decodedPath.id != 12 || decodedPath.segments.size() != 3 ||
        decodedPath.segments[1].verb != mgfx::ipc::PathVerb::lineTo ||
        decodedPath.segments[1].values[0] != 24.0F) {
        std::cerr << "Path upload payload round trip failed\n";
        return 1;
    }

    const mgfx::ipc::MeshUpload sourceMesh{31, {
        {{0.5F, 0.0F}, {1.0F, 0.0F, 0.0F, 1.0F}},
        {{0.0F, 1.0F}, {0.0F, 1.0F, 0.0F, 1.0F}},
        {{1.0F, 1.0F}, {0.0F, 0.0F, 1.0F, 1.0F}},
    }, {0, 1, 2}};
    mgfx::ipc::MeshUpload decodedMesh{};
    if (!mgfx::ipc::decodeMeshUpload(mgfx::ipc::encodeMeshUpload(sourceMesh), decodedMesh) ||
        decodedMesh.id != 31 || decodedMesh.vertices.size() != 3 ||
        decodedMesh.indices != std::vector<std::uint32_t>({0, 1, 2}) ||
        decodedMesh.vertices[2].color[2] != 1.0F) {
        std::cerr << "Mesh upload payload round trip failed\n";
        return 1;
    }

    std::string decodedText;
    if (!mgfx::ipc::decodeText(mgfx::ipc::encodeText("hello"), decodedText) ||
        decodedText != "hello") {
        std::cerr << "Text payload round trip failed\n";
        return 1;
    }

    float scrollX = 0.0F;
    float scrollY = 0.0F;
    float deltaX = 0.0F;
    float deltaY = 0.0F;
    if (!mgfx::ipc::decodeScroll(mgfx::ipc::encodeScroll(10.0F, 20.0F, -2.0F, 12.0F),
                                 scrollX, scrollY, deltaX, deltaY) ||
        scrollX != 10.0F || scrollY != 20.0F || deltaX != -2.0F || deltaY != 12.0F) {
        std::cerr << "Scroll payload round trip failed\n";
        return 1;
    }

    mgfx::ipc::Key decodedKey = mgfx::ipc::Key::unknown;
    std::uint16_t decodedModifiers = 0;
    bool decodedRepeat = false;
    if (!mgfx::ipc::decodeKey(
            mgfx::ipc::encodeKey(mgfx::ipc::Key::tab, mgfx::ipc::KeyModifier::shift, true),
            decodedKey, decodedModifiers, decodedRepeat) ||
        decodedKey != mgfx::ipc::Key::tab ||
        decodedModifiers != mgfx::ipc::KeyModifier::shift || !decodedRepeat) {
        std::cerr << "Semantic key payload round trip failed\n";
        return 1;
    }
    if (!mgfx::ipc::decodeKey(
            mgfx::ipc::encodeKey(mgfx::ipc::Key::paste,
                                 mgfx::ipc::KeyModifier::command, false),
            decodedKey, decodedModifiers, decodedRepeat) ||
        decodedKey != mgfx::ipc::Key::paste ||
        decodedModifiers != mgfx::ipc::KeyModifier::command || decodedRepeat) {
        std::cerr << "Clipboard shortcut key round trip failed\n";
        return 1;
    }

    const std::string path = "/tmp/mgfx-ipc-test-" + std::to_string(::getpid()) + ".sock";
    mgfx::ipc::Listener listener(path);
    bool duplicateRejected = false;
    try {
        mgfx::ipc::Listener duplicate(path);
    } catch (const std::exception&) {
        duplicateRejected = true;
    }
    if (!duplicateRejected) {
        std::cerr << "A second listener replaced a live MGFX socket\n";
        return 1;
    }

    bool serverPassed = false;
    std::thread server([&] {
        const std::shared_ptr<mgfx::ipc::Connection> connection = listener.accept();
        mgfx::ipc::Message message{};
        serverPassed = connection && connection->receive(message) &&
                       message.type == mgfx::ipc::MessageType::frame &&
                       message.payload == std::vector<std::uint8_t>({1, 2, 3});
        if (connection) {
            connection->send(mgfx::ipc::MessageType::resize,
                             mgfx::ipc::encodeSize(960, 640));
        }
    });

    const std::shared_ptr<mgfx::ipc::Connection> client = mgfx::ipc::connect(path);
    client->send(mgfx::ipc::MessageType::frame, {1, 2, 3});
    mgfx::ipc::Message response{};
    std::uint32_t width = 0;
    std::uint32_t height = 0;
    const bool clientPassed = client->receive(response) &&
                              response.type == mgfx::ipc::MessageType::resize &&
                              mgfx::ipc::decodeSize(response.payload, width, height) &&
                              width == 960 && height == 640;
    server.join();

    if (!serverPassed || !clientPassed) {
        std::cerr << "Local IPC round trip failed\n";
        return 1;
    }
    return 0;
}
