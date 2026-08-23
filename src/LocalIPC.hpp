#pragma once

#include <array>
#include <atomic>
#include <cstdint>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

namespace mgfx::ipc {

inline constexpr std::uint16_t protocolVersion = 1;
inline constexpr std::uint32_t maximumPayloadBytes = 64U * 1024U * 1024U;

enum class MessageType : std::uint16_t {
    frame = 1,
    resize = 2,
    pointerDown = 3,
    close = 4,
    pointerMove = 5,
    pointerUp = 6,
    keyDown = 7,
    keyUp = 8,
    scroll = 9,
    textInput = 10,
    windowTitle = 11,
    windowConfig = 12,
    windowState = 13,
    serverHello = 14,
    framePresented = 15,
    requestAnimationFrame = 16,
    animationFrame = 17,
    windowCursor = 18,
    clipboardWrite = 19,
    clipboardRead = 20,
    clipboardText = 21,
    windowChrome = 22,
    windowChromeMetrics = 23,
    textureCreate = 24,
    textureDestroy = 25,
    pathCreate = 26,
    pathDestroy = 27,
    textMeasure = 28,
    textMetrics = 29,
    meshCreate = 30,
    meshDestroy = 31,
    fontCreate = 32,
    fontDestroy = 33,
    serverCapabilities = 34,
    resourceStatus = 35,
};

enum class GraphicsBackend : std::uint16_t {
    metal = 1,
    vulkan = 2,
    directX = 3,
};

enum ServerCapability : std::uint64_t {
    clientWindowLifecycle = 1ULL << 0U,
    pointerInput = 1U << 1U,
    keyboardInput = 1U << 2U,
    textInputCapability = 1U << 3U,
    scrollInput = 1U << 4U,
    framePresentation = 1U << 5U,
    animationFrameClock = 1U << 6U,
    clientCursor = 1U << 7U,
    clipboard = 1U << 8U,
    clientWindowChrome = 1U << 9U,
    textureResources = 1U << 10U,
    pathResources = 1U << 11U,
    nativeTextMetrics = 1U << 12U,
    transformStack = 1U << 13U,
    opacityStack = 1U << 14U,
    softShadows = 1U << 15U,
    radialGradients = 1U << 16U,
    roundedRectangles = 1U << 17U,
    circles = 1U << 18U,
    diagonalPatterns = 1U << 19U,
    linearGradients = 1U << 20U,
    imageSurfaces = 1U << 21U,
    dotGrids = 1U << 22U,
    waveDots = 1U << 23U,
    meshResources = 1U << 24U,
    conicGradients = 1U << 25U,
    typographyStyles = 1U << 26U,
    textLetterSpacing = 1U << 27U,
    textDecorations = 1U << 28U,
    portableFontFamilies = 1U << 29U,
    fontResources = 1U << 30U,
    richTextRuns = 1ULL << 31U,
    capabilityWords64 = 1ULL << 32U,
    resourceStatusEvents = 1ULL << 33U,
    linearGradientCircles = 1ULL << 34U,
    gridPatterns = 1ULL << 35U,
    dashedPathStrokes = 1ULL << 36U,
    gradientPathStrokes = 1ULL << 37U,
    extendedPathStrokeStyles = 1ULL << 38U,
};

enum class ResourceKind : std::uint8_t {
    texture = 1,
    path = 2,
    mesh = 3,
    font = 4,
};

enum class ResourceState : std::uint8_t {
    ready = 1,
    rejected = 2,
};

struct ResourceStatus {
    ResourceKind kind;
    ResourceState state;
    std::uint32_t id;
};

enum class TextFamily : std::uint8_t {
    systemSans = 0,
    systemMonospace = 1,
    systemSerif = 2,
    systemRounded = 3,
};
enum class TextWeight : std::uint8_t { regular = 0, bold = 1, medium = 2, semibold = 3 };
enum class TextStyle : std::uint8_t { regular = 0, italic = 1 };

struct TextMeasure {
    TextFamily family;
    TextWeight weight;
    TextStyle style;
    float letterSpacing;
    std::uint32_t fontResourceId;
    std::string text;
};

struct FontUpload {
    std::uint32_t id;
    std::vector<std::uint8_t> bytes;
};

enum class WindowChromeMode : std::uint8_t {
    native = 0,
    overlay = 1,
};

struct WindowChrome {
    WindowChromeMode mode;
    std::uint32_t draggableHeight;
};

struct WindowChromeMetrics {
    float leadingInset;
    float titleBarHeight;
};

struct TextureUpload {
    std::uint32_t id;
    std::uint32_t width;
    std::uint32_t height;
    std::vector<std::uint8_t> rgba;
};

enum class PathVerb : std::uint8_t {
    moveTo = 1,
    lineTo = 2,
    cubicTo = 3,
    close = 4,
};

struct PathSegment {
    PathVerb verb;
    std::array<float, 6> values{};
};

struct PathUpload {
    std::uint32_t id;
    std::vector<PathSegment> segments;
};

struct MeshVertex {
    std::array<float, 2> position;
    std::array<float, 4> color;
};

struct MeshUpload {
    std::uint32_t id;
    std::vector<MeshVertex> vertices;
    std::vector<std::uint32_t> indices;
};

enum class CursorShape : std::uint8_t {
    arrow = 0,
    pointingHand = 1,
    text = 2,
    crosshair = 3,
    resizeHorizontal = 4,
    resizeVertical = 5,
};

struct ServerHello {
    std::uint16_t version;
    GraphicsBackend backend;
    std::uint32_t capabilities;
};

enum class Key : std::uint16_t {
    unknown = 0,
    tab = 1,
    enter = 2,
    space = 3,
    escape = 4,
    arrowLeft = 5,
    arrowRight = 6,
    arrowUp = 7,
    arrowDown = 8,
    backspace = 9,
    copy = 10,
    cut = 11,
    paste = 12,
    selectAll = 13,
};

enum KeyModifier : std::uint16_t {
    shift = 1U << 0U,
    control = 1U << 1U,
    alt = 1U << 2U,
    command = 1U << 3U,
};

struct Message {
    MessageType type{};
    std::uint32_t sequence = 0;
    std::vector<std::uint8_t> payload;
};

struct WindowConfig {
    std::uint32_t width;
    std::uint32_t height;
    std::uint32_t minimumWidth;
    std::uint32_t minimumHeight;
};

enum class WindowMode : std::uint8_t {
    normal = 0,
    maximized = 1,
    fullscreen = 2,
};

struct WindowState {
    WindowMode mode;
    bool resizable;
};

class Connection final {
public:
    explicit Connection(int descriptor);
    ~Connection();

    Connection(const Connection&) = delete;
    Connection& operator=(const Connection&) = delete;

    bool send(MessageType type,
              const std::vector<std::uint8_t>& payload = {},
              std::uint32_t sequence = 0);
    bool receive(Message& message);
    void close();

private:
    std::atomic<int> descriptor_{-1};
    std::mutex sendMutex_;
};

class Listener final {
public:
    explicit Listener(std::string socketPath);
    ~Listener();

    Listener(const Listener&) = delete;
    Listener& operator=(const Listener&) = delete;

    std::shared_ptr<Connection> accept();
    void close();
    const std::string& socketPath() const { return socketPath_; }

private:
    std::string socketPath_;
    std::string lockPath_;
    int descriptor_ = -1;
    int lockDescriptor_ = -1;
};

std::shared_ptr<Connection> connect(const std::string& socketPath);
std::string defaultSocketPath();

std::vector<std::uint8_t> encodeSize(std::uint32_t width, std::uint32_t height);
bool decodeSize(const std::vector<std::uint8_t>& payload,
                std::uint32_t& width,
                std::uint32_t& height);
std::vector<std::uint8_t> encodePoint(float x, float y);
bool decodePoint(const std::vector<std::uint8_t>& payload, float& x, float& y);
std::vector<std::uint8_t> encodeKey(Key key, std::uint16_t modifiers, bool repeat);
bool decodeKey(const std::vector<std::uint8_t>& payload,
               Key& key,
               std::uint16_t& modifiers,
               bool& repeat);
std::vector<std::uint8_t> encodeScroll(float x, float y, float deltaX, float deltaY);
bool decodeScroll(const std::vector<std::uint8_t>& payload,
                  float& x,
                  float& y,
                  float& deltaX,
                  float& deltaY);
std::vector<std::uint8_t> encodeText(const std::string& text);
bool decodeText(const std::vector<std::uint8_t>& payload, std::string& text);
std::vector<std::uint8_t> encodeWindowConfig(WindowConfig config);
bool decodeWindowConfig(const std::vector<std::uint8_t>& payload, WindowConfig& config);
std::vector<std::uint8_t> encodeWindowState(WindowState state);
bool decodeWindowState(const std::vector<std::uint8_t>& payload, WindowState& state);
std::vector<std::uint8_t> encodeServerHello(ServerHello hello);
bool decodeServerHello(const std::vector<std::uint8_t>& payload, ServerHello& hello);
std::vector<std::uint8_t> encodeServerCapabilities(std::uint64_t capabilities);
bool decodeServerCapabilities(const std::vector<std::uint8_t>& payload,
                              std::uint64_t& capabilities);
std::vector<std::uint8_t> encodeResourceStatus(ResourceStatus status);
bool decodeResourceStatus(const std::vector<std::uint8_t>& payload, ResourceStatus& status);
std::vector<std::uint8_t> encodeAnimationTime(std::uint64_t nanoseconds);
bool decodeAnimationTime(const std::vector<std::uint8_t>& payload,
                         std::uint64_t& nanoseconds);
std::vector<std::uint8_t> encodeCursor(CursorShape cursor);
bool decodeCursor(const std::vector<std::uint8_t>& payload, CursorShape& cursor);
std::vector<std::uint8_t> encodeWindowChrome(WindowChrome chrome);
bool decodeWindowChrome(const std::vector<std::uint8_t>& payload, WindowChrome& chrome);
std::vector<std::uint8_t> encodeWindowChromeMetrics(WindowChromeMetrics metrics);
bool decodeWindowChromeMetrics(const std::vector<std::uint8_t>& payload,
                               WindowChromeMetrics& metrics);
std::vector<std::uint8_t> encodeTextureUpload(const TextureUpload& texture);
bool decodeTextureUpload(const std::vector<std::uint8_t>& payload, TextureUpload& texture);
std::vector<std::uint8_t> encodePathUpload(const PathUpload& path);
bool decodePathUpload(const std::vector<std::uint8_t>& payload, PathUpload& path);
std::vector<std::uint8_t> encodeMeshUpload(const MeshUpload& mesh);
bool decodeMeshUpload(const std::vector<std::uint8_t>& payload, MeshUpload& mesh);
std::vector<std::uint8_t> encodeFontUpload(const FontUpload& font);
bool decodeFontUpload(const std::vector<std::uint8_t>& payload, FontUpload& font);
std::vector<std::uint8_t> encodeResourceId(std::uint32_t id);
bool decodeResourceId(const std::vector<std::uint8_t>& payload, std::uint32_t& id);
std::vector<std::uint8_t> encodeTextMeasure(const TextMeasure& measure);
bool decodeTextMeasure(const std::vector<std::uint8_t>& payload, TextMeasure& measure);
std::vector<std::uint8_t> encodeTextMetrics(float advance);
bool decodeTextMetrics(const std::vector<std::uint8_t>& payload, float& advance);

} // namespace mgfx::ipc
