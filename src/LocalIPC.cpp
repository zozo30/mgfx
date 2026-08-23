#include "LocalIPC.hpp"

#include <array>
#include <cerrno>
#include <cmath>
#include <cstring>
#include <stdexcept>
#include <system_error>
#include <utility>

#include <sys/socket.h>
#include <sys/file.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <fcntl.h>
#include <unistd.h>

namespace mgfx::ipc {
namespace {

constexpr std::size_t headerSize = 16;

void writeU16(std::uint8_t* bytes, std::uint16_t value) {
    bytes[0] = static_cast<std::uint8_t>(value);
    bytes[1] = static_cast<std::uint8_t>(value >> 8);
}

void writeU32(std::uint8_t* bytes, std::uint32_t value) {
    for (unsigned shift = 0; shift < 32; shift += 8) {
        *bytes++ = static_cast<std::uint8_t>(value >> shift);
    }
}

void writeU64(std::uint8_t* bytes, std::uint64_t value) {
    for (unsigned shift = 0; shift < 64; shift += 8) {
        *bytes++ = static_cast<std::uint8_t>(value >> shift);
    }
}

void writeFloat(std::uint8_t* bytes, float value) {
    std::uint32_t bits = 0;
    static_assert(sizeof(bits) == sizeof(value));
    std::memcpy(&bits, &value, sizeof(bits));
    writeU32(bytes, bits);
}

std::uint16_t readU16(const std::uint8_t* bytes) {
    return static_cast<std::uint16_t>(bytes[0]) |
           static_cast<std::uint16_t>(bytes[1] << 8);
}

std::uint32_t readU32(const std::uint8_t* bytes) {
    return static_cast<std::uint32_t>(bytes[0]) |
           (static_cast<std::uint32_t>(bytes[1]) << 8) |
           (static_cast<std::uint32_t>(bytes[2]) << 16) |
           (static_cast<std::uint32_t>(bytes[3]) << 24);
}

std::uint64_t readU64(const std::uint8_t* bytes) {
    std::uint64_t value = 0;
    for (unsigned shift = 0; shift < 64; shift += 8) {
        value |= static_cast<std::uint64_t>(*bytes++) << shift;
    }
    return value;
}

float readFloat(const std::uint8_t* bytes) {
    const std::uint32_t bits = readU32(bytes);
    float value = 0.0F;
    std::memcpy(&value, &bits, sizeof(value));
    return value;
}

void configureSocket(int descriptor) {
    int enabled = 1;
    if (::setsockopt(descriptor, SOL_SOCKET, SO_NOSIGPIPE, &enabled, sizeof(enabled)) != 0) {
        throw std::system_error(errno, std::generic_category(), "setsockopt(SO_NOSIGPIPE)");
    }
}

sockaddr_un addressFor(const std::string& path) {
    sockaddr_un address{};
    address.sun_family = AF_UNIX;
    if (path.empty() || path.size() >= sizeof(address.sun_path)) {
        throw std::invalid_argument("Unix socket path is empty or too long");
    }
    std::memcpy(address.sun_path, path.c_str(), path.size() + 1);
    return address;
}

bool sendAll(int descriptor, const std::uint8_t* bytes, std::size_t size) {
    while (size > 0) {
        const ssize_t sent = ::send(descriptor, bytes, size, 0);
        if (sent > 0) {
            bytes += sent;
            size -= static_cast<std::size_t>(sent);
        } else if (sent < 0 && errno == EINTR) {
            continue;
        } else {
            return false;
        }
    }
    return true;
}

bool receiveAll(int descriptor, std::uint8_t* bytes, std::size_t size) {
    while (size > 0) {
        const ssize_t received = ::recv(descriptor, bytes, size, 0);
        if (received > 0) {
            bytes += received;
            size -= static_cast<std::size_t>(received);
        } else if (received < 0 && errno == EINTR) {
            continue;
        } else {
            return false;
        }
    }
    return true;
}

void removeOwnedSocket(const std::string& path, bool required) {
    struct stat status {};
    if (::lstat(path.c_str(), &status) != 0) {
        if (errno == ENOENT || !required) {
            return;
        }
        throw std::system_error(errno, std::generic_category(), "lstat Unix socket");
    }
    if (!S_ISSOCK(status.st_mode) || status.st_uid != ::geteuid()) {
        if (required) {
            throw std::runtime_error("Refusing to replace a socket path not owned by this user");
        }
        return;
    }
    if (::unlink(path.c_str()) != 0 && required) {
        throw std::system_error(errno, std::generic_category(), "unlink Unix socket");
    }
}

} // namespace

Connection::Connection(int descriptor) : descriptor_(descriptor) {
    configureSocket(descriptor);
}

Connection::~Connection() {
    close();
}

bool Connection::send(MessageType type,
                      const std::vector<std::uint8_t>& payload,
                      std::uint32_t sequence) {
    const int descriptor = descriptor_.load();
    if (payload.size() > maximumPayloadBytes || descriptor < 0) {
        return false;
    }
    std::array<std::uint8_t, headerSize> header{};
    std::memcpy(header.data(), "MGIP", 4);
    writeU16(header.data() + 4, protocolVersion);
    writeU16(header.data() + 6, static_cast<std::uint16_t>(type));
    writeU32(header.data() + 8, static_cast<std::uint32_t>(payload.size()));
    writeU32(header.data() + 12, sequence);

    const std::lock_guard<std::mutex> lock(sendMutex_);
    return sendAll(descriptor, header.data(), header.size()) &&
           (payload.empty() || sendAll(descriptor, payload.data(), payload.size()));
}

bool Connection::receive(Message& message) {
    std::array<std::uint8_t, headerSize> header{};
    const int descriptor = descriptor_.load();
    if (descriptor < 0 || !receiveAll(descriptor, header.data(), header.size())) {
        return false;
    }
    if (std::memcmp(header.data(), "MGIP", 4) != 0 ||
        readU16(header.data() + 4) != protocolVersion) {
        return false;
    }
    const std::uint32_t payloadSize = readU32(header.data() + 8);
    if (payloadSize > maximumPayloadBytes) {
        return false;
    }
    message.type = static_cast<MessageType>(readU16(header.data() + 6));
    message.sequence = readU32(header.data() + 12);
    message.payload.resize(payloadSize);
    return payloadSize == 0 || receiveAll(descriptor, message.payload.data(), payloadSize);
}

void Connection::close() {
    const int descriptor = descriptor_.exchange(-1);
    if (descriptor >= 0) {
        ::shutdown(descriptor, SHUT_RDWR);
        ::close(descriptor);
    }
}

Listener::Listener(std::string socketPath)
    : socketPath_(std::move(socketPath)), lockPath_(socketPath_ + ".lock") {
    lockDescriptor_ = ::open(lockPath_.c_str(), O_CREAT | O_RDWR | O_CLOEXEC | O_NOFOLLOW,
                             S_IRUSR | S_IWUSR);
    if (lockDescriptor_ < 0) {
        throw std::system_error(errno, std::generic_category(), "open MGFX server lock");
    }
    struct stat lockStatus {};
    if (::fstat(lockDescriptor_, &lockStatus) != 0 || !S_ISREG(lockStatus.st_mode) ||
        lockStatus.st_uid != ::geteuid()) {
        ::close(lockDescriptor_);
        lockDescriptor_ = -1;
        throw std::runtime_error("MGFX server lock is not a user-owned regular file");
    }
    if (::flock(lockDescriptor_, LOCK_EX | LOCK_NB) != 0) {
        const int error = errno;
        ::close(lockDescriptor_);
        lockDescriptor_ = -1;
        if (error == EWOULDBLOCK) {
            throw std::runtime_error("An MGFX server is already running for this socket");
        }
        throw std::system_error(error, std::generic_category(), "lock MGFX server socket");
    }

    removeOwnedSocket(socketPath_, true);
    descriptor_ = ::socket(AF_UNIX, SOCK_STREAM, 0);
    if (descriptor_ < 0) {
        throw std::system_error(errno, std::generic_category(), "create Unix socket");
    }
    try {
        configureSocket(descriptor_);
        const sockaddr_un address = addressFor(socketPath_);
        if (::bind(descriptor_, reinterpret_cast<const sockaddr*>(&address), sizeof(address)) != 0) {
            throw std::system_error(errno, std::generic_category(), "bind Unix socket");
        }
        if (::chmod(socketPath_.c_str(), S_IRUSR | S_IWUSR) != 0) {
            throw std::system_error(errno, std::generic_category(), "chmod Unix socket");
        }
        if (::listen(descriptor_, 4) != 0) {
            throw std::system_error(errno, std::generic_category(), "listen Unix socket");
        }
    } catch (...) {
        close();
        removeOwnedSocket(socketPath_, false);
        ::flock(lockDescriptor_, LOCK_UN);
        ::close(lockDescriptor_);
        lockDescriptor_ = -1;
        throw;
    }
}

Listener::~Listener() {
    close();
    removeOwnedSocket(socketPath_, false);
    if (lockDescriptor_ >= 0) {
        ::flock(lockDescriptor_, LOCK_UN);
        ::close(lockDescriptor_);
        lockDescriptor_ = -1;
    }
}

std::shared_ptr<Connection> Listener::accept() {
    while (descriptor_ >= 0) {
        const int accepted = ::accept(descriptor_, nullptr, nullptr);
        if (accepted < 0) {
            if (errno == EINTR) {
                continue;
            }
            return {};
        }
        uid_t peerUser = 0;
        gid_t peerGroup = 0;
        if (::getpeereid(accepted, &peerUser, &peerGroup) == 0 && peerUser == ::geteuid()) {
            return std::make_shared<Connection>(accepted);
        }
        ::close(accepted);
    }
    return {};
}

void Listener::close() {
    if (descriptor_ >= 0) {
        ::shutdown(descriptor_, SHUT_RDWR);
        ::close(descriptor_);
        descriptor_ = -1;
    }
}

std::shared_ptr<Connection> connect(const std::string& socketPath) {
    const int descriptor = ::socket(AF_UNIX, SOCK_STREAM, 0);
    if (descriptor < 0) {
        throw std::system_error(errno, std::generic_category(), "create Unix client socket");
    }
    const sockaddr_un address = addressFor(socketPath);
    if (::connect(descriptor, reinterpret_cast<const sockaddr*>(&address), sizeof(address)) != 0) {
        const int error = errno;
        ::close(descriptor);
        throw std::system_error(error, std::generic_category(), "connect Unix socket");
    }
    return std::make_shared<Connection>(descriptor);
}

std::string defaultSocketPath() {
    return "/tmp/mgfx-" + std::to_string(::geteuid()) + ".sock";
}

std::vector<std::uint8_t> encodeSize(std::uint32_t width, std::uint32_t height) {
    std::vector<std::uint8_t> payload(8);
    writeU32(payload.data(), width);
    writeU32(payload.data() + 4, height);
    return payload;
}

bool decodeSize(const std::vector<std::uint8_t>& payload,
                std::uint32_t& width,
                std::uint32_t& height) {
    if (payload.size() != 8) {
        return false;
    }
    width = readU32(payload.data());
    height = readU32(payload.data() + 4);
    return true;
}

std::vector<std::uint8_t> encodePoint(float x, float y) {
    std::uint32_t xBits = 0;
    std::uint32_t yBits = 0;
    std::memcpy(&xBits, &x, sizeof(xBits));
    std::memcpy(&yBits, &y, sizeof(yBits));
    return encodeSize(xBits, yBits);
}

bool decodePoint(const std::vector<std::uint8_t>& payload, float& x, float& y) {
    std::uint32_t xBits = 0;
    std::uint32_t yBits = 0;
    if (!decodeSize(payload, xBits, yBits)) {
        return false;
    }
    std::memcpy(&x, &xBits, sizeof(x));
    std::memcpy(&y, &yBits, sizeof(y));
    return true;
}

std::vector<std::uint8_t> encodeKey(Key key, std::uint16_t modifiers, bool repeat) {
    std::vector<std::uint8_t> payload(8);
    writeU16(payload.data(), static_cast<std::uint16_t>(key));
    writeU16(payload.data() + 2, modifiers);
    writeU32(payload.data() + 4, repeat ? 1U : 0U);
    return payload;
}

bool decodeKey(const std::vector<std::uint8_t>& payload,
               Key& key,
               std::uint16_t& modifiers,
               bool& repeat) {
    if (payload.size() != 8) return false;
    key = static_cast<Key>(readU16(payload.data()));
    modifiers = readU16(payload.data() + 2);
    repeat = readU32(payload.data() + 4) != 0;
    return true;
}

std::vector<std::uint8_t> encodeScroll(float x, float y, float deltaX, float deltaY) {
    std::vector<std::uint8_t> payload = encodePoint(x, y);
    const std::vector<std::uint8_t> delta = encodePoint(deltaX, deltaY);
    payload.insert(payload.end(), delta.begin(), delta.end());
    return payload;
}

bool decodeScroll(const std::vector<std::uint8_t>& payload,
                  float& x,
                  float& y,
                  float& deltaX,
                  float& deltaY) {
    if (payload.size() != 16) return false;
    const std::vector<std::uint8_t> point(payload.begin(), payload.begin() + 8);
    const std::vector<std::uint8_t> delta(payload.begin() + 8, payload.end());
    return decodePoint(point, x, y) && decodePoint(delta, deltaX, deltaY);
}

std::vector<std::uint8_t> encodeText(const std::string& text) {
    return {text.begin(), text.end()};
}

bool decodeText(const std::vector<std::uint8_t>& payload, std::string& text) {
    text.assign(payload.begin(), payload.end());
    return true;
}

std::vector<std::uint8_t> encodeWindowConfig(WindowConfig config) {
    std::vector<std::uint8_t> payload(16);
    writeU32(payload.data(), config.width);
    writeU32(payload.data() + 4, config.height);
    writeU32(payload.data() + 8, config.minimumWidth);
    writeU32(payload.data() + 12, config.minimumHeight);
    return payload;
}

bool decodeWindowConfig(const std::vector<std::uint8_t>& payload, WindowConfig& config) {
    if (payload.size() != 16) return false;
    config = {readU32(payload.data()), readU32(payload.data() + 4),
              readU32(payload.data() + 8), readU32(payload.data() + 12)};
    return true;
}

std::vector<std::uint8_t> encodeWindowState(WindowState state) {
    return {static_cast<std::uint8_t>(state.mode),
            static_cast<std::uint8_t>(state.resizable ? 1U : 0U), 0, 0};
}

bool decodeWindowState(const std::vector<std::uint8_t>& payload, WindowState& state) {
    if (payload.size() != 4 || payload[0] > static_cast<std::uint8_t>(WindowMode::fullscreen) ||
        payload[1] > 1 || payload[2] != 0 || payload[3] != 0) return false;
    state = {static_cast<WindowMode>(payload[0]), payload[1] != 0};
    return true;
}

std::vector<std::uint8_t> encodeServerHello(ServerHello hello) {
    std::vector<std::uint8_t> payload(8);
    writeU16(payload.data(), hello.version);
    writeU16(payload.data() + 2, static_cast<std::uint16_t>(hello.backend));
    writeU32(payload.data() + 4, hello.capabilities);
    return payload;
}

bool decodeServerHello(const std::vector<std::uint8_t>& payload, ServerHello& hello) {
    if (payload.size() != 8) return false;
    const std::uint16_t backend = readU16(payload.data() + 2);
    if (backend < static_cast<std::uint16_t>(GraphicsBackend::metal) ||
        backend > static_cast<std::uint16_t>(GraphicsBackend::directX)) return false;
    hello.version = readU16(payload.data());
    hello.backend = static_cast<GraphicsBackend>(backend);
    hello.capabilities = readU32(payload.data() + 4);
    return true;
}

std::vector<std::uint8_t> encodeAnimationTime(std::uint64_t nanoseconds) {
    std::vector<std::uint8_t> payload(8);
    writeU64(payload.data(), nanoseconds);
    return payload;
}

bool decodeAnimationTime(const std::vector<std::uint8_t>& payload,
                         std::uint64_t& nanoseconds) {
    if (payload.size() != 8) return false;
    nanoseconds = readU64(payload.data());
    return true;
}

std::vector<std::uint8_t> encodeCursor(CursorShape cursor) {
    return {static_cast<std::uint8_t>(cursor), 0, 0, 0};
}

bool decodeCursor(const std::vector<std::uint8_t>& payload, CursorShape& cursor) {
    if (payload.size() != 4 ||
        payload[0] > static_cast<std::uint8_t>(CursorShape::resizeVertical) ||
        payload[1] != 0 || payload[2] != 0 || payload[3] != 0) return false;
    cursor = static_cast<CursorShape>(payload[0]);
    return true;
}

std::vector<std::uint8_t> encodeWindowChrome(WindowChrome chrome) {
    std::vector<std::uint8_t> payload(8);
    payload[0] = static_cast<std::uint8_t>(chrome.mode);
    writeU32(payload.data() + 4, chrome.draggableHeight);
    return payload;
}

bool decodeWindowChrome(const std::vector<std::uint8_t>& payload, WindowChrome& chrome) {
    if (payload.size() != 8 ||
        payload[0] > static_cast<std::uint8_t>(WindowChromeMode::overlay) ||
        payload[1] != 0 || payload[2] != 0 || payload[3] != 0) return false;
    chrome = {static_cast<WindowChromeMode>(payload[0]), readU32(payload.data() + 4)};
    return true;
}

std::vector<std::uint8_t> encodeWindowChromeMetrics(WindowChromeMetrics metrics) {
    return encodePoint(metrics.leadingInset, metrics.titleBarHeight);
}

bool decodeWindowChromeMetrics(const std::vector<std::uint8_t>& payload,
                               WindowChromeMetrics& metrics) {
    return decodePoint(payload, metrics.leadingInset, metrics.titleBarHeight);
}

std::vector<std::uint8_t> encodeTextureUpload(const TextureUpload& texture) {
    std::vector<std::uint8_t> payload(16 + texture.rgba.size());
    writeU32(payload.data(), texture.id);
    writeU32(payload.data() + 4, texture.width);
    writeU32(payload.data() + 8, texture.height);
    writeU32(payload.data() + 12, 0);
    std::copy(texture.rgba.begin(), texture.rgba.end(), payload.begin() + 16);
    return payload;
}

bool decodeTextureUpload(const std::vector<std::uint8_t>& payload, TextureUpload& texture) {
    if (payload.size() < 16 || readU32(payload.data() + 12) != 0) return false;
    const std::uint32_t id = readU32(payload.data());
    const std::uint32_t width = readU32(payload.data() + 4);
    const std::uint32_t height = readU32(payload.data() + 8);
    if (id == 0 || width == 0 || height == 0 || width > 4096 || height > 4096 ||
        static_cast<std::uint64_t>(width) * height * 4 != payload.size() - 16) return false;
    texture = {id, width, height, {payload.begin() + 16, payload.end()}};
    return true;
}

std::vector<std::uint8_t> encodePathUpload(const PathUpload& path) {
    constexpr std::size_t segmentBytes = 28;
    std::vector<std::uint8_t> payload(16 + path.segments.size() * segmentBytes);
    writeU32(payload.data(), path.id);
    writeU32(payload.data() + 4, static_cast<std::uint32_t>(path.segments.size()));
    std::uint8_t* target = payload.data() + 16;
    for (const PathSegment& segment : path.segments) {
        target[0] = static_cast<std::uint8_t>(segment.verb);
        for (std::size_t index = 0; index < segment.values.size(); ++index) {
            writeFloat(target + 4 + index * 4, segment.values[index]);
        }
        target += segmentBytes;
    }
    return payload;
}

bool decodePathUpload(const std::vector<std::uint8_t>& payload, PathUpload& path) {
    constexpr std::size_t segmentBytes = 28;
    if (payload.size() < 16 || readU32(payload.data() + 8) != 0 ||
        readU32(payload.data() + 12) != 0) return false;
    const std::uint32_t id = readU32(payload.data());
    const std::uint32_t count = readU32(payload.data() + 4);
    if (id == 0 || count == 0 || count > 65'536 ||
        payload.size() != 16 + static_cast<std::size_t>(count) * segmentBytes) return false;
    std::vector<PathSegment> segments;
    segments.reserve(count);
    const std::uint8_t* source = payload.data() + 16;
    bool hasMove = false;
    for (std::uint32_t item = 0; item < count; ++item, source += segmentBytes) {
        if (source[0] < static_cast<std::uint8_t>(PathVerb::moveTo) ||
            source[0] > static_cast<std::uint8_t>(PathVerb::close) ||
            source[1] != 0 || source[2] != 0 || source[3] != 0) return false;
        PathSegment segment{static_cast<PathVerb>(source[0]), {}};
        for (std::size_t index = 0; index < segment.values.size(); ++index) {
            segment.values[index] = readFloat(source + 4 + index * 4);
            if (!std::isfinite(segment.values[index])) return false;
        }
        if (segment.verb == PathVerb::moveTo) hasMove = true;
        else if (!hasMove) return false;
        segments.push_back(segment);
    }
    if (!hasMove) return false;
    path = {id, std::move(segments)};
    return true;
}

std::vector<std::uint8_t> encodeResourceId(std::uint32_t id) {
    std::vector<std::uint8_t> payload(4);
    writeU32(payload.data(), id);
    return payload;
}

bool decodeResourceId(const std::vector<std::uint8_t>& payload, std::uint32_t& id) {
    if (payload.size() != 4 || (id = readU32(payload.data())) == 0) return false;
    return true;
}

std::vector<std::uint8_t> encodeTextMeasure(const TextMeasure& measure) {
    std::vector<std::uint8_t> payload(4 + measure.text.size());
    payload[0] = static_cast<std::uint8_t>(measure.family);
    payload[1] = static_cast<std::uint8_t>(measure.weight);
    std::copy(measure.text.begin(), measure.text.end(), payload.begin() + 4);
    return payload;
}

bool decodeTextMeasure(const std::vector<std::uint8_t>& payload, TextMeasure& measure) {
    if (payload.size() <= 4 || payload.size() > 65'540 ||
        payload[0] > static_cast<std::uint8_t>(TextFamily::systemMonospace) ||
        payload[1] > static_cast<std::uint8_t>(TextWeight::bold) ||
        payload[2] != 0 || payload[3] != 0) return false;
    measure.family = static_cast<TextFamily>(payload[0]);
    measure.weight = static_cast<TextWeight>(payload[1]);
    measure.text.assign(payload.begin() + 4, payload.end());
    return measure.text.find('\0') == std::string::npos;
}

std::vector<std::uint8_t> encodeTextMetrics(float advance) {
    std::vector<std::uint8_t> payload(4);
    writeFloat(payload.data(), advance);
    return payload;
}

bool decodeTextMetrics(const std::vector<std::uint8_t>& payload, float& advance) {
    if (payload.size() != 4 || !std::isfinite(advance = readFloat(payload.data())) ||
        advance < 0.0F) return false;
    return true;
}

} // namespace mgfx::ipc
