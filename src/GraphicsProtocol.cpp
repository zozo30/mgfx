#include "GraphicsProtocol.hpp"

#include <cstring>
#include <limits>
#include <stdexcept>

namespace gfx {
namespace {

constexpr std::size_t streamHeaderSize = 16;
constexpr std::size_t commandHeaderSize = 8;
constexpr std::size_t vertexWireSize = 24;

void appendU16(std::vector<std::uint8_t>& bytes, std::uint16_t value) {
    bytes.push_back(static_cast<std::uint8_t>(value));
    bytes.push_back(static_cast<std::uint8_t>(value >> 8));
}

void appendU32(std::vector<std::uint8_t>& bytes, std::uint32_t value) {
    for (unsigned shift = 0; shift < 32; shift += 8) {
        bytes.push_back(static_cast<std::uint8_t>(value >> shift));
    }
}

void appendFloat(std::vector<std::uint8_t>& bytes, float value) {
    static_assert(sizeof(float) == sizeof(std::uint32_t));
    std::uint32_t bits = 0;
    std::memcpy(&bits, &value, sizeof(bits));
    appendU32(bytes, bits);
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

float readFloat(const std::uint8_t* bytes) {
    const std::uint32_t bits = readU32(bytes);
    float value = 0.0F;
    std::memcpy(&value, &bits, sizeof(value));
    return value;
}

void patchU32(std::vector<std::uint8_t>& bytes, std::size_t offset, std::uint32_t value) {
    for (unsigned shift = 0; shift < 32; shift += 8) {
        bytes[offset++] = static_cast<std::uint8_t>(value >> shift);
    }
}

} // namespace

CommandEncoder::CommandEncoder() {
    bytes_.insert(bytes_.end(), {'M', 'G', 'F', 'X'});
    appendU16(bytes_, protocolVersion);
    appendU16(bytes_, 0); // Stream flags, reserved for future use.
    appendU32(bytes_, 0); // Total byte count, patched by finish().
    appendU32(bytes_, 0); // Command count, patched by finish().
}

void CommandEncoder::beginCommand(Opcode opcode, std::uint32_t payloadSize) {
    if (finished_) {
        throw std::logic_error("Cannot append to a finished graphics command stream");
    }
    appendU16(bytes_, static_cast<std::uint16_t>(opcode));
    appendU16(bytes_, 0); // Command flags.
    appendU32(bytes_, payloadSize);
    ++commandCount_;
}

void CommandEncoder::clear(Color color) {
    beginCommand(Opcode::clear, 4 * sizeof(float));
    appendFloat(bytes_, color.red);
    appendFloat(bytes_, color.green);
    appendFloat(bytes_, color.blue);
    appendFloat(bytes_, color.alpha);
}

void CommandEncoder::draw(Primitive primitive,
                          const Vertex* vertices,
                          std::uint32_t vertexCount) {
    if (vertices == nullptr && vertexCount != 0) {
        throw std::invalid_argument("Vertex data is null");
    }
    if (vertexCount > (std::numeric_limits<std::uint32_t>::max() - 8) / vertexWireSize) {
        throw std::length_error("Too many vertices for one protocol command");
    }

    beginCommand(Opcode::draw, 8 + vertexCount * vertexWireSize);
    bytes_.push_back(static_cast<std::uint8_t>(primitive));
    bytes_.insert(bytes_.end(), 3, 0); // Alignment/reserved bytes.
    appendU32(bytes_, vertexCount);

    for (std::uint32_t index = 0; index < vertexCount; ++index) {
        appendFloat(bytes_, vertices[index].position[0]);
        appendFloat(bytes_, vertices[index].position[1]);
        for (float component : vertices[index].color) {
            appendFloat(bytes_, component);
        }
    }
}

void CommandEncoder::endFrame() {
    beginCommand(Opcode::endFrame, 0);
}

void CommandEncoder::pushClip(ClipRect clip) {
    beginCommand(Opcode::pushClip, 4 * sizeof(float));
    appendFloat(bytes_, clip.left);
    appendFloat(bytes_, clip.top);
    appendFloat(bytes_, clip.right);
    appendFloat(bytes_, clip.bottom);
}

void CommandEncoder::popClip() {
    beginCommand(Opcode::popClip, 0);
}

void CommandEncoder::pushTransform(AffineTransform transform) {
    beginCommand(Opcode::pushTransform, 6 * sizeof(float));
    for (float value : {transform.m11, transform.m12, transform.m21, transform.m22,
                        transform.translateX, transform.translateY}) {
        appendFloat(bytes_, value);
    }
}

void CommandEncoder::popTransform() {
    beginCommand(Opcode::popTransform, 0);
}

void CommandEncoder::pushOpacity(float opacity) {
    beginCommand(Opcode::pushOpacity, sizeof(float));
    appendFloat(bytes_, opacity);
}

void CommandEncoder::popOpacity() {
    beginCommand(Opcode::popOpacity, 0);
}

void CommandEncoder::drawImage(const ImageCommand& image) {
    beginCommand(Opcode::drawImage, 56);
    appendU32(bytes_, image.textureId);
    appendU32(bytes_, 0);
    for (float value : {image.destination.left, image.destination.top,
                        image.destination.right, image.destination.bottom,
                        image.uv.left, image.uv.top, image.uv.right, image.uv.bottom,
                        image.tint.red, image.tint.green, image.tint.blue, image.tint.alpha}) {
        appendFloat(bytes_, value);
    }
}

void CommandEncoder::drawPath(const PathCommand& path) {
    beginCommand(Opcode::drawPath, 128);
    appendU32(bytes_, path.pathId);
    bytes_.push_back(static_cast<std::uint8_t>((path.fill ? 1U : 0U) |
                                               (path.stroke ? 2U : 0U) |
                                               (path.fillGradient ? 4U : 0U)));
    bytes_.push_back(static_cast<std::uint8_t>(path.fillRule));
    bytes_.push_back(static_cast<std::uint8_t>(path.lineCap));
    bytes_.push_back(static_cast<std::uint8_t>(path.lineJoin));
    appendFloat(bytes_, path.strokeWidth);
    appendFloat(bytes_, path.tolerance);
    for (float value : {path.destination.left, path.destination.top,
                        path.destination.right, path.destination.bottom,
                        path.viewBox.x, path.viewBox.y,
                        path.viewBox.width, path.viewBox.height,
                        path.fillColor.red, path.fillColor.green,
                        path.fillColor.blue, path.fillColor.alpha,
                        path.strokeColor.red, path.strokeColor.green,
                        path.strokeColor.blue, path.strokeColor.alpha}) {
        appendFloat(bytes_, value);
    }
    for (float value : {path.gradient.startX, path.gradient.startY,
                        path.gradient.endX, path.gradient.endY,
                        path.gradient.startColor.red, path.gradient.startColor.green,
                        path.gradient.startColor.blue, path.gradient.startColor.alpha,
                        path.gradient.endColor.red, path.gradient.endColor.green,
                        path.gradient.endColor.blue, path.gradient.endColor.alpha}) {
        appendFloat(bytes_, value);
    }
}

void CommandEncoder::drawText(const TextCommand& text) {
    constexpr std::size_t headerSize = 32;
    if (text.text.size() > std::numeric_limits<std::uint32_t>::max() - headerSize) {
        throw std::length_error("Text command exceeds 4 GiB");
    }
    beginCommand(Opcode::drawText,
                 static_cast<std::uint32_t>(headerSize + text.text.size()));
    bytes_.push_back(static_cast<std::uint8_t>(text.family));
    bytes_.push_back(static_cast<std::uint8_t>(text.weight));
    bytes_.insert(bytes_.end(), 2, 0);
    for (float value : {text.left, text.top, text.fontSize,
                        text.color.red, text.color.green,
                        text.color.blue, text.color.alpha}) {
        appendFloat(bytes_, value);
    }
    bytes_.insert(bytes_.end(), text.text.begin(), text.text.end());
}

std::vector<std::uint8_t> CommandEncoder::finish() {
    if (bytes_.size() > std::numeric_limits<std::uint32_t>::max()) {
        throw std::length_error("Graphics command stream exceeds 4 GiB");
    }
    patchU32(bytes_, 8, static_cast<std::uint32_t>(bytes_.size()));
    patchU32(bytes_, 12, commandCount_);
    finished_ = true;
    return bytes_;
}

CommandDecoder::CommandDecoder(const std::vector<std::uint8_t>& bytes) : bytes_(bytes) {
    if (bytes.size() < streamHeaderSize) {
        error_ = "Command stream is smaller than its header";
        return;
    }
    if (std::memcmp(bytes.data(), "MGFX", 4) != 0) {
        error_ = "Command stream has an invalid magic value";
        return;
    }
    if (readU16(bytes.data() + 4) != protocolVersion) {
        error_ = "Unsupported graphics protocol version";
        return;
    }
    if (readU32(bytes.data() + 8) != bytes.size()) {
        error_ = "Command stream byte count does not match its header";
        return;
    }

    commandsRemaining_ = readU32(bytes.data() + 12);
    offset_ = streamHeaderSize;
}

bool CommandDecoder::next(CommandView& command) {
    if (!valid() || commandsRemaining_ == 0) {
        if (valid() && commandsRemaining_ == 0 && offset_ != bytes_.size()) {
            error_ = "Command stream has trailing bytes";
        }
        return false;
    }
    if (offset_ > bytes_.size() || bytes_.size() - offset_ < commandHeaderSize) {
        error_ = "Truncated command header";
        return false;
    }

    const auto* header = bytes_.data() + offset_;
    const std::uint32_t payloadSize = readU32(header + 4);
    offset_ += commandHeaderSize;
    if (payloadSize > bytes_.size() - offset_) {
        error_ = "Truncated command payload";
        return false;
    }

    command = {static_cast<Opcode>(readU16(header)), bytes_.data() + offset_, payloadSize};
    offset_ += payloadSize;
    --commandsRemaining_;
    return true;
}

bool decodeClear(const CommandView& command, Color& color) {
    if (command.opcode != Opcode::clear || command.payloadSize != 16) {
        return false;
    }
    color = {readFloat(command.payload),
             readFloat(command.payload + 4),
             readFloat(command.payload + 8),
             readFloat(command.payload + 12)};
    return true;
}

bool decodeDraw(const CommandView& command, DrawCommand& draw) {
    if (command.opcode != Opcode::draw || command.payloadSize < 8) {
        return false;
    }

    const std::uint32_t vertexCount = readU32(command.payload + 4);
    if (vertexCount > (std::numeric_limits<std::uint32_t>::max() - 8) / vertexWireSize ||
        command.payloadSize != 8 + vertexCount * vertexWireSize) {
        return false;
    }

    draw.primitive = static_cast<Primitive>(command.payload[0]);
    draw.vertices.resize(vertexCount);
    const std::uint8_t* source = command.payload + 8;
    for (Vertex& vertex : draw.vertices) {
        vertex.position = {readFloat(source), readFloat(source + 4)};
        for (std::size_t component = 0; component < vertex.color.size(); ++component) {
            vertex.color[component] = readFloat(source + 8 + component * 4);
        }
        source += vertexWireSize;
    }
    return true;
}

bool decodePushClip(const CommandView& command, ClipRect& clip) {
    if (command.opcode != Opcode::pushClip || command.payloadSize != 16) return false;
    clip = {readFloat(command.payload), readFloat(command.payload + 4),
            readFloat(command.payload + 8), readFloat(command.payload + 12)};
    return true;
}

bool decodePushTransform(const CommandView& command, AffineTransform& transform) {
    if (command.opcode != Opcode::pushTransform || command.payloadSize != 24) return false;
    transform = {readFloat(command.payload), readFloat(command.payload + 4),
                 readFloat(command.payload + 8), readFloat(command.payload + 12),
                 readFloat(command.payload + 16), readFloat(command.payload + 20)};
    return true;
}

bool decodePushOpacity(const CommandView& command, float& opacity) {
    if (command.opcode != Opcode::pushOpacity || command.payloadSize != 4) return false;
    opacity = readFloat(command.payload);
    return true;
}

bool decodeImage(const CommandView& command, ImageCommand& image) {
    if (command.opcode != Opcode::drawImage || command.payloadSize != 56 ||
        readU32(command.payload + 4) != 0) return false;
    image.textureId = readU32(command.payload);
    image.destination = {readFloat(command.payload + 8), readFloat(command.payload + 12),
                         readFloat(command.payload + 16), readFloat(command.payload + 20)};
    image.uv = {readFloat(command.payload + 24), readFloat(command.payload + 28),
                readFloat(command.payload + 32), readFloat(command.payload + 36)};
    image.tint = {readFloat(command.payload + 40), readFloat(command.payload + 44),
                  readFloat(command.payload + 48), readFloat(command.payload + 52)};
    return image.textureId != 0;
}

bool decodePath(const CommandView& command, PathCommand& path) {
    if (command.opcode != Opcode::drawPath || command.payloadSize != 128 ||
        command.payload[4] > 7 ||
        command.payload[5] > static_cast<std::uint8_t>(FillRule::evenodd) ||
        command.payload[6] > static_cast<std::uint8_t>(LineCap::round) ||
        command.payload[7] > static_cast<std::uint8_t>(LineJoin::round)) return false;
    path.pathId = readU32(command.payload);
    path.fill = (command.payload[4] & 1U) != 0;
    path.stroke = (command.payload[4] & 2U) != 0;
    path.fillGradient = (command.payload[4] & 4U) != 0;
    path.fillRule = static_cast<FillRule>(command.payload[5]);
    path.lineCap = static_cast<LineCap>(command.payload[6]);
    path.lineJoin = static_cast<LineJoin>(command.payload[7]);
    path.strokeWidth = readFloat(command.payload + 8);
    path.tolerance = readFloat(command.payload + 12);
    path.destination = {readFloat(command.payload + 16), readFloat(command.payload + 20),
                        readFloat(command.payload + 24), readFloat(command.payload + 28)};
    path.viewBox = {readFloat(command.payload + 32), readFloat(command.payload + 36),
                    readFloat(command.payload + 40), readFloat(command.payload + 44)};
    path.fillColor = {readFloat(command.payload + 48), readFloat(command.payload + 52),
                      readFloat(command.payload + 56), readFloat(command.payload + 60)};
    path.strokeColor = {readFloat(command.payload + 64), readFloat(command.payload + 68),
                        readFloat(command.payload + 72), readFloat(command.payload + 76)};
    path.gradient = {readFloat(command.payload + 80), readFloat(command.payload + 84),
                     readFloat(command.payload + 88), readFloat(command.payload + 92),
                     {readFloat(command.payload + 96), readFloat(command.payload + 100),
                      readFloat(command.payload + 104), readFloat(command.payload + 108)},
                     {readFloat(command.payload + 112), readFloat(command.payload + 116),
                      readFloat(command.payload + 120), readFloat(command.payload + 124)}};
    return path.pathId != 0 && (path.fill || path.stroke) &&
           (!path.fillGradient || path.fill);
}

bool decodeText(const CommandView& command, TextCommand& text) {
    constexpr std::size_t headerSize = 32;
    if (command.opcode != Opcode::drawText || command.payloadSize <= headerSize ||
        command.payloadSize > headerSize + 65536 ||
        command.payload[0] > static_cast<std::uint8_t>(FontFamily::systemMonospace) ||
        command.payload[1] > static_cast<std::uint8_t>(FontWeight::bold) ||
        command.payload[2] != 0 || command.payload[3] != 0) {
        return false;
    }
    text.family = static_cast<FontFamily>(command.payload[0]);
    text.weight = static_cast<FontWeight>(command.payload[1]);
    text.left = readFloat(command.payload + 4);
    text.top = readFloat(command.payload + 8);
    text.fontSize = readFloat(command.payload + 12);
    text.color = {readFloat(command.payload + 16), readFloat(command.payload + 20),
                  readFloat(command.payload + 24), readFloat(command.payload + 28)};
    text.text.assign(reinterpret_cast<const char*>(command.payload + headerSize),
                     command.payloadSize - headerSize);
    return text.text.find('\0') == std::string::npos;
}

} // namespace gfx
