#include "GraphicsServer.hpp"
#include "SystemText.hpp"

#include "GraphicsProtocol.hpp"

#include <utility>

GraphicsServer::GraphicsServer(std::string socketPath) : socketPath_(std::move(socketPath)) {}

GraphicsServer::~GraphicsServer() {
    stop();
}

void GraphicsServer::start() {
    if (thread_.joinable()) {
        return;
    }
    stopping_ = false;
    listener_ = std::make_unique<mgfx::ipc::Listener>(socketPath_);
    thread_ = std::thread([this] { run(); });
}

void GraphicsServer::stop() {
    stopping_ = true;
    if (listener_) {
        listener_->close();
    }
    if (const auto active = connection()) {
        active->close();
    }
    if (thread_.joinable()) {
        thread_.join();
    }
    if (clientThread_.joinable()) {
        clientThread_.join();
    }
    listener_.reset();
}

void GraphicsServer::setDrawableSize(std::uint32_t width, std::uint32_t height) {
    {
        const std::lock_guard<std::mutex> lock(sizeMutex_);
        width_ = width;
        height_ = height;
    }
    if (const auto active = connection()) {
        active->send(mgfx::ipc::MessageType::resize, mgfx::ipc::encodeSize(width, height));
    }
}

void GraphicsServer::sendPointerDown(float x, float y) {
    if (const auto active = connection()) {
        active->send(mgfx::ipc::MessageType::pointerDown, mgfx::ipc::encodePoint(x, y));
    }
}

void GraphicsServer::sendPointerMove(float x, float y) {
    if (const auto active = connection()) {
        active->send(mgfx::ipc::MessageType::pointerMove, mgfx::ipc::encodePoint(x, y));
    }
}

void GraphicsServer::sendPointerUp(float x, float y) {
    if (const auto active = connection()) {
        active->send(mgfx::ipc::MessageType::pointerUp, mgfx::ipc::encodePoint(x, y));
    }
}

void GraphicsServer::sendKeyDown(mgfx::ipc::Key key, std::uint16_t modifiers, bool repeat) {
    if (const auto active = connection()) {
        active->send(mgfx::ipc::MessageType::keyDown, mgfx::ipc::encodeKey(key, modifiers, repeat));
    }
}

void GraphicsServer::sendKeyUp(mgfx::ipc::Key key, std::uint16_t modifiers) {
    if (const auto active = connection()) {
        active->send(mgfx::ipc::MessageType::keyUp, mgfx::ipc::encodeKey(key, modifiers, false));
    }
}

void GraphicsServer::sendScroll(float x, float y, float deltaX, float deltaY) {
    if (const auto active = connection()) {
        active->send(mgfx::ipc::MessageType::scroll,
                     mgfx::ipc::encodeScroll(x, y, deltaX, deltaY));
    }
}

void GraphicsServer::sendTextInput(const std::string& text) {
    if (const auto active = connection()) {
        active->send(mgfx::ipc::MessageType::textInput, mgfx::ipc::encodeText(text));
    }
}

void GraphicsServer::sendClose() {
    if (const auto active = connection()) {
        active->send(mgfx::ipc::MessageType::close);
    }
}

void GraphicsServer::sendWindowChromeMetrics(float leadingInset, float titleBarHeight) {
    if (const auto active = connection()) {
        active->send(mgfx::ipc::MessageType::windowChromeMetrics,
                     mgfx::ipc::encodeWindowChromeMetrics({leadingInset, titleBarHeight}));
    }
}

void GraphicsServer::acknowledgeFramePresented(std::uint64_t connectionGeneration,
                                               std::uint32_t sequence) {
    std::shared_ptr<mgfx::ipc::Connection> active;
    {
        const std::lock_guard<std::mutex> lock(connectionMutex_);
        if (connectionGeneration_ != connectionGeneration) return;
        active = connection_;
    }
    if (active) {
        active->send(mgfx::ipc::MessageType::framePresented, {}, sequence);
    }
}

void GraphicsServer::serviceAnimationFrame(std::uint64_t monotonicNanoseconds) {
    std::optional<std::pair<std::uint64_t, std::uint32_t>> request;
    {
        const std::lock_guard<std::mutex> lock(animationMutex_);
        request = pendingAnimationFrame_;
        pendingAnimationFrame_.reset();
    }
    if (!request) return;

    std::shared_ptr<mgfx::ipc::Connection> active;
    {
        const std::lock_guard<std::mutex> lock(connectionMutex_);
        if (connectionGeneration_ != request->first) return;
        active = connection_;
    }
    if (active) {
        active->send(mgfx::ipc::MessageType::animationFrame,
                     mgfx::ipc::encodeAnimationTime(monotonicNanoseconds),
                     request->second);
    }
}

FrameSnapshot GraphicsServer::latestFrame() const {
    const std::lock_guard<std::mutex> lock(frameMutex_);
    return {latestFrame_, latestFrameSequence_, latestFrameRevision_,
            latestFrameConnectionGeneration_};
}

std::optional<std::string> GraphicsServer::takeWindowTitle() {
    const std::lock_guard<std::mutex> lock(titleMutex_);
    std::optional<std::string> title = std::move(pendingTitle_);
    pendingTitle_.reset();
    return title;
}

std::optional<mgfx::ipc::WindowConfig> GraphicsServer::takeWindowConfig() {
    const std::lock_guard<std::mutex> lock(titleMutex_);
    std::optional<mgfx::ipc::WindowConfig> config = std::move(pendingWindowConfig_);
    pendingWindowConfig_.reset();
    return config;
}

std::optional<mgfx::ipc::WindowState> GraphicsServer::takeWindowState() {
    const std::lock_guard<std::mutex> lock(titleMutex_);
    std::optional<mgfx::ipc::WindowState> state = std::move(pendingWindowState_);
    pendingWindowState_.reset();
    return state;
}

std::optional<mgfx::ipc::CursorShape> GraphicsServer::takeWindowCursor() {
    const std::lock_guard<std::mutex> lock(titleMutex_);
    const std::optional<mgfx::ipc::CursorShape> cursor = pendingWindowCursor_;
    pendingWindowCursor_.reset();
    return cursor;
}

std::optional<mgfx::ipc::WindowChrome> GraphicsServer::takeWindowChrome() {
    const std::lock_guard<std::mutex> lock(titleMutex_);
    const std::optional<mgfx::ipc::WindowChrome> chrome = pendingWindowChrome_;
    pendingWindowChrome_.reset();
    return chrome;
}

std::optional<std::string> GraphicsServer::takeClipboardWrite() {
    const std::lock_guard<std::mutex> lock(clipboardMutex_);
    std::optional<std::string> text = std::move(pendingClipboardWrite_);
    pendingClipboardWrite_.reset();
    return text;
}

std::optional<std::pair<std::uint64_t, std::uint32_t>> GraphicsServer::takeClipboardRead() {
    const std::lock_guard<std::mutex> lock(clipboardMutex_);
    const auto request = pendingClipboardRead_;
    pendingClipboardRead_.reset();
    return request;
}

std::vector<PendingResourceUpload<mgfx::ipc::TextureUpload>> GraphicsServer::takeTextureUploads() {
    const std::lock_guard<std::mutex> lock(resourceMutex_);
    std::vector<PendingResourceUpload<mgfx::ipc::TextureUpload>> result;
    result.swap(pendingTextureUploads_);
    return result;
}

std::vector<std::uint32_t> GraphicsServer::takeTextureDestroys() {
    const std::lock_guard<std::mutex> lock(resourceMutex_);
    std::vector<std::uint32_t> result;
    result.swap(pendingTextureDestroys_);
    return result;
}

std::vector<PendingResourceUpload<mgfx::ipc::PathUpload>> GraphicsServer::takePathUploads() {
    const std::lock_guard<std::mutex> lock(resourceMutex_);
    std::vector<PendingResourceUpload<mgfx::ipc::PathUpload>> result;
    result.swap(pendingPathUploads_);
    return result;
}

std::vector<std::uint32_t> GraphicsServer::takePathDestroys() {
    const std::lock_guard<std::mutex> lock(resourceMutex_);
    std::vector<std::uint32_t> result;
    result.swap(pendingPathDestroys_);
    return result;
}

std::vector<PendingResourceUpload<mgfx::ipc::MeshUpload>> GraphicsServer::takeMeshUploads() {
    const std::lock_guard<std::mutex> lock(resourceMutex_);
    std::vector<PendingResourceUpload<mgfx::ipc::MeshUpload>> result;
    result.swap(pendingMeshUploads_);
    return result;
}

std::vector<std::uint32_t> GraphicsServer::takeMeshDestroys() {
    const std::lock_guard<std::mutex> lock(resourceMutex_);
    std::vector<std::uint32_t> result;
    result.swap(pendingMeshDestroys_);
    return result;
}

void GraphicsServer::sendClipboardText(std::uint64_t connectionGeneration,
                                       std::uint32_t sequence,
                                       const std::string& text) {
    std::shared_ptr<mgfx::ipc::Connection> active;
    {
        const std::lock_guard<std::mutex> lock(connectionMutex_);
        if (connectionGeneration_ != connectionGeneration) return;
        active = connection_;
    }
    if (active) {
        active->send(mgfx::ipc::MessageType::clipboardText,
                     mgfx::ipc::encodeText(text), sequence);
    }
}

void GraphicsServer::sendResourceStatus(std::uint64_t connectionGeneration,
                                        mgfx::ipc::ResourceStatus status) {
    std::shared_ptr<mgfx::ipc::Connection> active;
    {
        const std::lock_guard<std::mutex> lock(connectionMutex_);
        if (connectionGeneration_ != connectionGeneration) return;
        active = connection_;
    }
    if (active) {
        active->send(mgfx::ipc::MessageType::resourceStatus,
                     mgfx::ipc::encodeResourceStatus(status));
    }
}

bool GraphicsServer::takeClientDisconnected() {
    return clientDisconnected_.exchange(false);
}

std::shared_ptr<mgfx::ipc::Connection> GraphicsServer::connection() const {
    const std::lock_guard<std::mutex> lock(connectionMutex_);
    return connection_;
}

void GraphicsServer::run() {
    while (!stopping_) {
        const auto active = listener_->accept();
        if (!active) {
            return;
        }
        std::shared_ptr<mgfx::ipc::Connection> previous;
        std::uint64_t generation = 0;
        {
            const std::lock_guard<std::mutex> lock(connectionMutex_);
            previous = connection_;
            connection_ = active;
            generation = ++connectionGeneration_;
        }
        if (previous) {
            previous->close();
        }
        if (clientThread_.joinable()) {
            clientThread_.join();
        }
        {
            const std::lock_guard<std::mutex> lock(frameMutex_);
            latestFrame_.reset();
            latestFrameSequence_ = 0;
            latestFrameConnectionGeneration_ = generation;
            ++latestFrameRevision_;
        }
        {
            const std::lock_guard<std::mutex> lock(titleMutex_);
            pendingTitle_.reset();
            pendingWindowConfig_.reset();
            pendingWindowState_.reset();
            pendingWindowCursor_.reset();
            pendingWindowChrome_.reset();
        }
        {
            const std::lock_guard<std::mutex> lock(animationMutex_);
            pendingAnimationFrame_.reset();
        }
        {
            const std::lock_guard<std::mutex> lock(clipboardMutex_);
            pendingClipboardWrite_.reset();
            pendingClipboardRead_.reset();
        }
        {
            const std::lock_guard<std::mutex> lock(resourceMutex_);
            pendingTextureUploads_.clear();
            pendingTextureDestroys_.clear();
            pendingPathUploads_.clear();
            pendingPathDestroys_.clear();
            pendingMeshUploads_.clear();
            pendingMeshDestroys_.clear();
        }
        gfx::clearFontResources();
        clientDisconnected_ = false;
        constexpr std::uint64_t capabilities =
            mgfx::ipc::ServerCapability::clientWindowLifecycle |
            mgfx::ipc::ServerCapability::pointerInput |
            mgfx::ipc::ServerCapability::keyboardInput |
            mgfx::ipc::ServerCapability::textInputCapability |
            mgfx::ipc::ServerCapability::scrollInput |
            mgfx::ipc::ServerCapability::framePresentation |
            mgfx::ipc::ServerCapability::animationFrameClock |
            mgfx::ipc::ServerCapability::clientCursor |
            mgfx::ipc::ServerCapability::clipboard |
            mgfx::ipc::ServerCapability::clientWindowChrome |
            mgfx::ipc::ServerCapability::textureResources |
            mgfx::ipc::ServerCapability::pathResources |
            mgfx::ipc::ServerCapability::nativeTextMetrics |
            mgfx::ipc::ServerCapability::transformStack |
            mgfx::ipc::ServerCapability::opacityStack |
            mgfx::ipc::ServerCapability::softShadows |
            mgfx::ipc::ServerCapability::radialGradients |
            mgfx::ipc::ServerCapability::roundedRectangles |
            mgfx::ipc::ServerCapability::circles |
            mgfx::ipc::ServerCapability::diagonalPatterns |
            mgfx::ipc::ServerCapability::linearGradients |
            mgfx::ipc::ServerCapability::imageSurfaces |
            mgfx::ipc::ServerCapability::dotGrids |
            mgfx::ipc::ServerCapability::waveDots |
            mgfx::ipc::ServerCapability::meshResources |
            mgfx::ipc::ServerCapability::conicGradients |
            mgfx::ipc::ServerCapability::typographyStyles |
            mgfx::ipc::ServerCapability::textLetterSpacing |
            mgfx::ipc::ServerCapability::textDecorations |
            mgfx::ipc::ServerCapability::portableFontFamilies |
            mgfx::ipc::ServerCapability::fontResources |
            mgfx::ipc::ServerCapability::richTextRuns |
            mgfx::ipc::ServerCapability::capabilityWords64 |
            mgfx::ipc::ServerCapability::resourceStatusEvents |
            mgfx::ipc::ServerCapability::linearGradientCircles |
            mgfx::ipc::ServerCapability::gridPatterns |
            mgfx::ipc::ServerCapability::dashedPathStrokes |
            mgfx::ipc::ServerCapability::gradientPathStrokes |
            mgfx::ipc::ServerCapability::extendedPathStrokeStyles |
            mgfx::ipc::ServerCapability::customPathMiterLimits |
            mgfx::ipc::ServerCapability::arbitraryPathDashArrays |
            mgfx::ipc::ServerCapability::multiStopPathGradients |
            mgfx::ipc::ServerCapability::pathGradientSpreadModes |
            mgfx::ipc::ServerCapability::radialPathGradients |
            mgfx::ipc::ServerCapability::multiStopRadialPathGradients |
            mgfx::ipc::ServerCapability::radialPathGradientSpreadModes |
            mgfx::ipc::ServerCapability::focalRadialPathGradients |
            mgfx::ipc::ServerCapability::twoCircleRadialPathGradients |
            mgfx::ipc::ServerCapability::radialPathGradientStrokes |
            mgfx::ipc::ServerCapability::styledRadialPathPaint |
            mgfx::ipc::ServerCapability::conicPathGradients |
            mgfx::ipc::ServerCapability::texturePathPaint |
            mgfx::ipc::ServerCapability::nativeTextPlacement |
            mgfx::ipc::ServerCapability::nativeRichTextPlacement |
            mgfx::ipc::ServerCapability::richTextRunMetrics;
        active->send(mgfx::ipc::MessageType::serverHello,
                     mgfx::ipc::encodeServerHello({mgfx::ipc::protocolVersion,
                                                   mgfx::ipc::GraphicsBackend::metal,
                                                   static_cast<std::uint32_t>(capabilities)}));
        active->send(mgfx::ipc::MessageType::serverCapabilities,
                     mgfx::ipc::encodeServerCapabilities(capabilities));
        {
            const std::lock_guard<std::mutex> lock(sizeMutex_);
            if (width_ > 0 && height_ > 0) {
                active->send(mgfx::ipc::MessageType::resize,
                             mgfx::ipc::encodeSize(width_, height_));
            }
        }

        clientThread_ = std::thread([this, active, generation] {
            readConnection(active, generation);
        });
    }
}

void GraphicsServer::readConnection(const std::shared_ptr<mgfx::ipc::Connection>& active,
                                    std::uint64_t generation) {
    mgfx::ipc::Message message{};
    bool clientClosed = false;
    while (!stopping_ && !clientClosed && active->receive(message)) {
        if (message.type == mgfx::ipc::MessageType::frame) {
            gfx::CommandDecoder decoder(message.payload);
            gfx::CommandView command{};
            while (decoder.next(command)) {
            }
            if (decoder.valid()) {
                const std::lock_guard<std::mutex> lock(frameMutex_);
                latestFrame_ = std::make_shared<const std::vector<std::uint8_t>>(
                    std::move(message.payload));
                latestFrameSequence_ = message.sequence;
                latestFrameConnectionGeneration_ = generation;
                ++latestFrameRevision_;
            }
        } else if (message.type == mgfx::ipc::MessageType::close) {
            clientClosed = true;
        } else if (message.type == mgfx::ipc::MessageType::windowTitle &&
                   message.payload.size() <= 1024) {
            std::string title;
            if (mgfx::ipc::decodeText(message.payload, title) &&
                title.find('\0') == std::string::npos) {
                const std::lock_guard<std::mutex> lock(titleMutex_);
                pendingTitle_ = std::move(title);
            }
        } else if (message.type == mgfx::ipc::MessageType::windowConfig) {
            mgfx::ipc::WindowConfig config{};
            if (mgfx::ipc::decodeWindowConfig(message.payload, config) &&
                config.width >= 320 && config.height >= 240 &&
                config.width <= 8192 && config.height <= 8192 &&
                config.minimumWidth <= config.width && config.minimumHeight <= config.height) {
                const std::lock_guard<std::mutex> lock(titleMutex_);
                pendingWindowConfig_ = config;
            }
        } else if (message.type == mgfx::ipc::MessageType::windowState) {
            mgfx::ipc::WindowState state{};
            if (mgfx::ipc::decodeWindowState(message.payload, state)) {
                const std::lock_guard<std::mutex> lock(titleMutex_);
                pendingWindowState_ = state;
            }
        } else if (message.type == mgfx::ipc::MessageType::requestAnimationFrame &&
                   message.payload.empty() && message.sequence != 0) {
            const std::lock_guard<std::mutex> lock(animationMutex_);
            pendingAnimationFrame_ = std::make_pair(generation, message.sequence);
        } else if (message.type == mgfx::ipc::MessageType::windowCursor) {
            mgfx::ipc::CursorShape cursor{};
            if (mgfx::ipc::decodeCursor(message.payload, cursor)) {
                const std::lock_guard<std::mutex> lock(titleMutex_);
                pendingWindowCursor_ = cursor;
            }
        } else if (message.type == mgfx::ipc::MessageType::clipboardWrite &&
                   message.payload.size() <= 1024U * 1024U) {
            std::string text;
            if (mgfx::ipc::decodeText(message.payload, text) &&
                text.find('\0') == std::string::npos) {
                const std::lock_guard<std::mutex> lock(clipboardMutex_);
                pendingClipboardWrite_ = std::move(text);
            }
        } else if (message.type == mgfx::ipc::MessageType::clipboardRead &&
                   message.payload.empty() && message.sequence != 0) {
            const std::lock_guard<std::mutex> lock(clipboardMutex_);
            pendingClipboardRead_ = std::make_pair(generation, message.sequence);
        } else if (message.type == mgfx::ipc::MessageType::windowChrome) {
            mgfx::ipc::WindowChrome chrome{};
            if (mgfx::ipc::decodeWindowChrome(message.payload, chrome) &&
                chrome.draggableHeight <= 512) {
                const std::lock_guard<std::mutex> lock(titleMutex_);
                pendingWindowChrome_ = chrome;
            }
        } else if (message.type == mgfx::ipc::MessageType::textureCreate) {
            mgfx::ipc::TextureUpload texture{};
            if (mgfx::ipc::decodeTextureUpload(message.payload, texture)) {
                const std::lock_guard<std::mutex> lock(resourceMutex_);
                pendingTextureUploads_.push_back({generation, std::move(texture)});
            }
        } else if (message.type == mgfx::ipc::MessageType::textureDestroy) {
            std::uint32_t id = 0;
            if (mgfx::ipc::decodeResourceId(message.payload, id)) {
                const std::lock_guard<std::mutex> lock(resourceMutex_);
                pendingTextureDestroys_.push_back(id);
            }
        } else if (message.type == mgfx::ipc::MessageType::pathCreate) {
            mgfx::ipc::PathUpload path{};
            if (mgfx::ipc::decodePathUpload(message.payload, path)) {
                const std::lock_guard<std::mutex> lock(resourceMutex_);
                pendingPathUploads_.push_back({generation, std::move(path)});
            }
        } else if (message.type == mgfx::ipc::MessageType::pathDestroy) {
            std::uint32_t id = 0;
            if (mgfx::ipc::decodeResourceId(message.payload, id)) {
                const std::lock_guard<std::mutex> lock(resourceMutex_);
                pendingPathDestroys_.push_back(id);
            }
        } else if (message.type == mgfx::ipc::MessageType::meshCreate) {
            mgfx::ipc::MeshUpload mesh{};
            if (mgfx::ipc::decodeMeshUpload(message.payload, mesh)) {
                const std::lock_guard<std::mutex> lock(resourceMutex_);
                pendingMeshUploads_.push_back({generation, std::move(mesh)});
            }
        } else if (message.type == mgfx::ipc::MessageType::meshDestroy) {
            std::uint32_t id = 0;
            if (mgfx::ipc::decodeResourceId(message.payload, id)) {
                const std::lock_guard<std::mutex> lock(resourceMutex_);
                pendingMeshDestroys_.push_back(id);
            }
        } else if (message.type == mgfx::ipc::MessageType::fontCreate) {
            mgfx::ipc::FontUpload font{};
            if (mgfx::ipc::decodeFontUpload(message.payload, font)) {
                const bool ready = gfx::createFontResource(font.id, font.bytes);
                sendResourceStatus(generation, {mgfx::ipc::ResourceKind::font,
                    ready ? mgfx::ipc::ResourceState::ready : mgfx::ipc::ResourceState::rejected,
                    font.id});
            }
        } else if (message.type == mgfx::ipc::MessageType::fontDestroy) {
            std::uint32_t id = 0;
            if (mgfx::ipc::decodeResourceId(message.payload, id)) {
                gfx::destroyFontResource(id);
            }
        } else if (message.type == mgfx::ipc::MessageType::textMeasure &&
                   message.sequence != 0) {
            mgfx::ipc::TextMeasure measure{};
            if (mgfx::ipc::decodeTextMeasure(message.payload, measure)) {
                const gfx::FontFamily family = measure.family == mgfx::ipc::TextFamily::systemMonospace
                    ? gfx::FontFamily::systemMonospace
                    : measure.family == mgfx::ipc::TextFamily::systemSerif
                    ? gfx::FontFamily::systemSerif
                    : measure.family == mgfx::ipc::TextFamily::systemRounded
                    ? gfx::FontFamily::systemRounded : gfx::FontFamily::systemSans;
                const gfx::FontWeight weight = measure.weight == mgfx::ipc::TextWeight::bold
                    ? gfx::FontWeight::bold : measure.weight == mgfx::ipc::TextWeight::medium
                    ? gfx::FontWeight::medium : measure.weight == mgfx::ipc::TextWeight::semibold
                    ? gfx::FontWeight::semibold : gfx::FontWeight::regular;
                const gfx::FontStyle style = measure.style == mgfx::ipc::TextStyle::italic
                    ? gfx::FontStyle::italic : gfx::FontStyle::regular;
                const float advance = gfx::measureSystemText(
                    measure.text, family, weight, style, measure.letterSpacing,
                    measure.fontResourceId);
                active->send(mgfx::ipc::MessageType::textMetrics,
                             mgfx::ipc::encodeTextMetrics(advance), message.sequence);
            }
        }
    }
    bool disconnected = false;
    {
        const std::lock_guard<std::mutex> lock(connectionMutex_);
        if (connection_ == active) {
            connection_.reset();
            disconnected = true;
        }
    }
    if (disconnected && !stopping_) {
        gfx::clearFontResources();
        {
            const std::lock_guard<std::mutex> lock(frameMutex_);
            latestFrame_.reset();
            latestFrameSequence_ = 0;
            ++latestFrameRevision_;
        }
        {
            const std::lock_guard<std::mutex> lock(clipboardMutex_);
            pendingClipboardWrite_.reset();
            pendingClipboardRead_.reset();
        }
        clientDisconnected_ = true;
    }
}
